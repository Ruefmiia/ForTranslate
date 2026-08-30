from __future__ import annotations

from contextlib import asynccontextmanager
from decimal import Decimal, ROUND_CEILING
import hmac

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.datastructures import MutableHeaders

from .config import Settings
from .database import Database
from .llm import LLMClient, ModelError
from .version import __version__


class TextTranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    context: str = Field(default="", max_length=20_000)
    source: str = Field(default="", max_length=100)


class TermRequest(BaseModel):
    source: str = Field(min_length=1, max_length=200)
    target: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=500)


class ExtensionPrivateNetworkMiddleware:
    """Allow Chrome/Edge extensions to reach a loopback-hosted backend."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").lower()
        private_network = headers.get(b"access-control-request-private-network", b"").lower() == b"true"
        extension_origin = origin.startswith((b"chrome-extension://", b"edge-extension://"))
        if not (private_network and extension_origin):
            await self.app(scope, receive, send)
            return

        filtered_scope = dict(scope)
        filtered_scope["headers"] = [
            (name, value)
            for name, value in scope.get("headers", [])
            if name.lower() != b"access-control-request-private-network"
        ]

        async def send_with_private_network(message):
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["Access-Control-Allow-Private-Network"] = "true"
            await send(message)

        await self.app(filtered_scope, receive, send_with_private_network)


def create_app(settings: Settings | None = None, llm_client: LLMClient | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    database = Database(settings.database_path)
    client = llm_client or LLMClient(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        database.initialize()
        yield

    app = FastAPI(title="ForTranslate Backend", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(ExtensionPrivateNetworkMiddleware)
    app.state.database = database
    app.state.llm_client = client
    app.state.settings = settings

    def authenticate(authorization: str | None = Header(default=None)) -> dict:
        scheme, _, token = (authorization or "").partition(" ")
        legacy_match = bool(settings.access_token) and hmac.compare_digest(token, settings.access_token)
        database_match = database.authenticate_access_token(token) if scheme.lower() == "bearer" else None
        if scheme.lower() != "bearer" or not (legacy_match or database_match):
            raise HTTPException(
                status_code=401,
                detail="Invalid or missing access token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if database_match:
            return database_match
        return {"id": None, "name": "legacy-global-token"}

    def billing_units(usage: dict) -> int:
        value = (
            Decimal(usage["input_tokens"]) * settings.input_price_per_million
            + Decimal(usage["output_tokens"]) * settings.output_price_per_million
        )
        return int(value.to_integral_value(rounding=ROUND_CEILING))

    def require_quota(identity: dict) -> int | None:
        token_id = identity.get("id")
        if token_id is not None and not database.has_available_quota(token_id):
            raise HTTPException(status_code=429, detail="Token quota exhausted")
        return token_id

    auth = [Depends(authenticate)]

    @app.get("/health", dependencies=auth)
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/v1/translate/text")
    def translate_text(payload: TextTranslationRequest, identity: dict = Depends(authenticate)) -> dict:
        if len(payload.text) > settings.max_text_chars:
            raise HTTPException(
                status_code=413,
                detail=f"Text exceeds the {settings.max_text_chars} character limit",
            )
        token_id = require_quota(identity)
        terms = database.matching_terms(payload.text, payload.context)
        try:
            result, usage = client.translate_text(payload.text, payload.context, terms)
        except ModelError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        database.record_usage(
            "text", payload.source, settings.llm_model, usage["input_tokens"], usage["output_tokens"],
            token_id=token_id, billing_units=billing_units(usage),
        )
        return result | {"usage": usage}

    @app.post("/v1/translate/image")
    async def translate_image(
        request: Request,
        image: UploadFile = File(...),
        source: str = Form(default=""),
        identity: dict = Depends(authenticate),
    ) -> dict:
        token_id = require_quota(identity)
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.max_image_bytes + 1024 * 1024:
                    raise HTTPException(status_code=413, detail="Image is too large")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid Content-Length")
        if not image.content_type or not image.content_type.startswith("image/"):
            raise HTTPException(status_code=415, detail="Uploaded file must be an image")
        data = await image.read(settings.max_image_bytes + 1)
        if len(data) > settings.max_image_bytes:
            raise HTTPException(status_code=413, detail="Image is too large")
        if not data:
            raise HTTPException(status_code=422, detail="Image is empty")
        try:
            result, usage = client.translate_image(data, image.content_type, source, database.list_terms())
        except ModelError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        database.record_usage(
            "image", source, settings.llm_model, usage["input_tokens"], usage["output_tokens"],
            token_id=token_id, billing_units=billing_units(usage),
        )
        return result | {"usage": usage}

    @app.get("/v1/glossary", dependencies=auth)
    def list_glossary() -> dict:
        return {"terms": database.list_terms()}

    @app.put("/v1/glossary", dependencies=auth)
    def put_glossary(payload: TermRequest) -> dict:
        source = payload.source.strip()
        target = payload.target.strip()
        if not source or not target:
            raise HTTPException(status_code=422, detail="Source and target are required")
        return database.upsert_term(source, target, payload.note.strip())

    @app.delete("/v1/glossary/{term_id}", dependencies=auth)
    def delete_glossary(term_id: int) -> dict:
        if not database.delete_term(term_id):
            raise HTTPException(status_code=404, detail="Glossary term not found")
        return {"deleted": True}

    @app.get("/v1/usage", dependencies=auth)
    def usage() -> dict:
        return database.usage_summary()

    return app


app = create_app()

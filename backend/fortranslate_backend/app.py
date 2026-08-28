from __future__ import annotations

from contextlib import asynccontextmanager
import hmac

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import Settings
from .database import Database
from .llm import LLMClient, ModelError


class TextTranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    context: str = Field(default="", max_length=20_000)
    source: str = Field(default="", max_length=100)


class TermRequest(BaseModel):
    source: str = Field(min_length=1, max_length=200)
    target: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=500)


def create_app(settings: Settings | None = None, llm_client: LLMClient | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    database = Database(settings.database_path)
    client = llm_client or LLMClient(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        database.initialize()
        yield

    app = FastAPI(title="ForTranslate Backend", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.state.database = database
    app.state.llm_client = client
    app.state.settings = settings

    def authenticate(authorization: str | None = Header(default=None)) -> None:
        if not settings.access_token:
            raise HTTPException(status_code=503, detail="Access token is not configured")
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(token, settings.access_token):
            raise HTTPException(
                status_code=401,
                detail="Invalid or missing access token",
                headers={"WWW-Authenticate": "Bearer"},
            )

    auth = [Depends(authenticate)]

    @app.get("/health", dependencies=auth)
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/v1/translate/text", dependencies=auth)
    def translate_text(payload: TextTranslationRequest) -> dict:
        terms = database.matching_terms(payload.text, payload.context)
        try:
            result, usage = client.translate_text(payload.text, payload.context, terms)
        except ModelError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        database.record_usage("text", payload.source, settings.llm_model, usage["input_tokens"], usage["output_tokens"])
        return result | {"usage": usage}

    @app.post("/v1/translate/image", dependencies=auth)
    async def translate_image(
        request: Request,
        image: UploadFile = File(...),
        source: str = Form(default=""),
    ) -> dict:
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
        database.record_usage("image", source, settings.llm_model, usage["input_tokens"], usage["output_tokens"])
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

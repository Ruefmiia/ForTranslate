from __future__ import annotations

from collections import OrderedDict
from concurrent.futures import Future
from copy import deepcopy
from threading import Lock
from time import monotonic
from typing import Callable


ZERO_USAGE = {"input_tokens": 0, "output_tokens": 0}


class TextTranslationCache:
    def __init__(self, ttl_seconds: float, max_entries: int):
        self.ttl_seconds = max(0.0, ttl_seconds)
        self.max_entries = max(0, max_entries)
        self._lock = Lock()
        self._entries: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._pending: dict[str, Future] = {}

    @property
    def enabled(self) -> bool:
        return self.ttl_seconds > 0 and self.max_entries > 0

    def get_or_compute(
        self,
        key: str,
        compute: Callable[[], tuple[dict, dict]],
    ) -> tuple[dict, dict, bool]:
        if not self.enabled:
            result, usage = compute()
            return result, usage, False

        now = monotonic()
        owner = False
        with self._lock:
            self._remove_expired(now)
            cached = self._entries.get(key)
            if cached is not None:
                self._entries.move_to_end(key)
                return deepcopy(cached[1]), dict(ZERO_USAGE), True

            pending = self._pending.get(key)
            if pending is None:
                pending = Future()
                self._pending[key] = pending
                owner = True

        if not owner:
            return deepcopy(pending.result()), dict(ZERO_USAGE), True

        try:
            result, usage = compute()
        except BaseException as exc:
            with self._lock:
                self._pending.pop(key, None)
                pending.set_exception(exc)
            raise

        cached_result = deepcopy(result)
        with self._lock:
            self._entries[key] = (monotonic() + self.ttl_seconds, cached_result)
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)
            self._pending.pop(key, None)
            pending.set_result(deepcopy(cached_result))
        return result, usage, False

    def _remove_expired(self, now: float) -> None:
        expired = [key for key, (expires_at, _) in self._entries.items() if expires_at <= now]
        for key in expired:
            self._entries.pop(key, None)

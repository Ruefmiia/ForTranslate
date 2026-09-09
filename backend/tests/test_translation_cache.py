from concurrent.futures import ThreadPoolExecutor
import threading

from fortranslate_backend.translation_cache import TextTranslationCache


def test_concurrent_identical_requests_share_one_computation():
    cache = TextTranslationCache(ttl_seconds=60, max_entries=8)
    started = threading.Event()
    release = threading.Event()
    calls = 0
    calls_lock = threading.Lock()

    def compute():
        nonlocal calls
        with calls_lock:
            calls += 1
        started.set()
        assert release.wait(timeout=2)
        return {"translation": "译文"}, {"input_tokens": 10, "output_tokens": 4}

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(cache.get_or_compute, "same-key", compute)
        assert started.wait(timeout=2)
        second = executor.submit(cache.get_or_compute, "same-key", compute)
        release.set()
        first_result = first.result(timeout=2)
        second_result = second.result(timeout=2)

    assert calls == 1
    assert sorted([first_result[2], second_result[2]]) == [False, True]
    cached_result = second_result if second_result[2] else first_result
    assert cached_result[1] == {"input_tokens": 0, "output_tokens": 0}

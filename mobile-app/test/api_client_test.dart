import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:fortranslate_mobile/api_client.dart';

void main() {
  test('sends bearer token and preserves emoji and line breaks', () async {
    final client = MockClient((request) async {
      expect(request.url.toString(), 'http://example.test/v1/translate/text');
      expect(request.headers['authorization'], 'Bearer ft_test');
      expect(jsonDecode(request.body)['source'], 'android_app');
      return http.Response(
        jsonEncode({
          'translation': '🐶：你好\n🐱：你好',
          'notes': ['保留说话者标记'],
          'usage': {'input_tokens': 12, 'output_tokens': 8},
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final result = await ForTranslateApi(client: client).translate(
      baseUrl: 'http://example.test/',
      token: 'ft_test',
      text: '🐶：สวัสดี\n🐱：hello',
    );
    expect(result.translation, '🐶：你好\n🐱：你好');
    expect(result.inputTokens, 12);
    expect(result.outputTokens, 8);
  });

  test('surfaces backend authentication errors', () async {
    final client = MockClient(
      (_) async => http.Response(
        jsonEncode({'detail': 'Invalid or missing access token'}),
        401,
        headers: {'content-type': 'application/json'},
      ),
    );
    expect(
      () => ForTranslateApi(
        client: client,
      ).testConnection(baseUrl: 'http://example.test', token: 'wrong'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          'Invalid or missing access token',
        ),
      ),
    );
  });

  test('loads the authenticated token balance', () async {
    final client = MockClient((request) async {
      expect(request.url.toString(), 'http://example.test/v1/token/usage');
      expect(request.headers['authorization'], 'Bearer ft_test');
      return http.Response(
        jsonEncode({
          'metered': true,
          'unlimited': false,
          'name': 'Android 用户',
          'quota_yuan': 5,
          'used_yuan': 1.25,
          'remaining_yuan': 3.75,
          'requests': 42,
          'exhausted': false,
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final balance = await ForTranslateApi(
      client: client,
    ).tokenBalance(baseUrl: 'http://example.test', token: 'ft_test');
    expect(balance.unlimited, isFalse);
    expect(balance.remainingYuan, 3.75);
    expect(balance.usedYuan, 1.25);
    expect(balance.quotaYuan, 5);
    expect(balance.requests, 42);
  });

  test('parses the unlimited administrator token balance', () async {
    final client = MockClient(
      (_) async => http.Response(
        jsonEncode({
          'metered': false,
          'unlimited': true,
          'name': 'legacy-global-token',
        }),
        200,
        headers: {'content-type': 'application/json'},
      ),
    );
    final balance = await ForTranslateApi(
      client: client,
    ).tokenBalance(baseUrl: 'http://example.test', token: 'admin');
    expect(balance.unlimited, isTrue);
    expect(balance.remainingYuan, isNull);
  });
}

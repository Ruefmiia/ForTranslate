import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'models.dart';

class ApiException implements Exception {
  const ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ForTranslateApi {
  ForTranslateApi({
    http.Client? client,
    this.timeout = const Duration(seconds: 45),
  }) : _client = client ?? http.Client();
  final http.Client _client;
  final Duration timeout;

  Future<void> testConnection({
    required String baseUrl,
    required String token,
  }) async {
    final payload = await _request(baseUrl, token, '/health');
    if (payload['status'] != 'ok') throw const ApiException('服务状态异常');
  }

  Future<TranslationResult> translate({
    required String baseUrl,
    required String token,
    required String text,
  }) async {
    final payload = await _request(
      baseUrl,
      token,
      '/v1/translate/text',
      method: 'POST',
      body: {'text': text, 'context': '', 'source': 'android_app'},
    );
    try {
      return TranslationResult.fromJson(payload);
    } on FormatException catch (error) {
      throw ApiException(error.message);
    }
  }

  Future<TokenBalance> tokenBalance({
    required String baseUrl,
    required String token,
  }) async {
    final payload = await _request(baseUrl, token, '/v1/token/usage');
    return TokenBalance.fromJson(payload);
  }

  Future<Map<String, dynamic>> _request(
    String baseUrl,
    String token,
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final normalized = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.tryParse('$normalized$path');
    if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
      throw const ApiException('服务地址格式不正确');
    }
    if (token.trim().isEmpty) throw const ApiException('请先填写访问令牌');
    try {
      final headers = <String, String>{
        'Authorization': 'Bearer ${token.trim()}',
      };
      late http.Response response;
      if (method == 'POST') {
        headers['Content-Type'] = 'application/json';
        response = await _client
            .post(uri, headers: headers, body: jsonEncode(body))
            .timeout(timeout);
      } else {
        response = await _client.get(uri, headers: headers).timeout(timeout);
      }
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      final payload = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{};
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiException(
          payload['detail']?.toString() ?? '翻译服务返回 ${response.statusCode}',
        );
      }
      return payload;
    } on TimeoutException {
      throw const ApiException('连接超时，请检查服务状态');
    } on SocketException {
      throw const ApiException('无法连接翻译服务，请检查地址和网络');
    } on http.ClientException {
      throw const ApiException('无法连接翻译服务，请检查地址和网络');
    } on FormatException {
      throw const ApiException('服务返回了无效数据');
    }
  }
}

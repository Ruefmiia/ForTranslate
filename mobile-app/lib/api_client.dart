import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'models.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
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

  String _serviceError(int statusCode, String? detail) {
    switch (statusCode) {
      case 401:
        return '访问令牌无效或已停用，请在设置中更新令牌';
      case 413:
        return '原文不能超过 3000 个字符，请缩短后重试';
      case 429:
        return '翻译额度已用完，请联系管理员充值';
      case 502:
        return '模型服务暂时不可用，请稍后重试';
      default:
        if (statusCode >= 500) return '翻译服务暂时不可用，请稍后重试';
        return detail ?? '翻译服务返回 $statusCode';
    }
  }

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
          _serviceError(response.statusCode, payload['detail']?.toString()),
          statusCode: response.statusCode,
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

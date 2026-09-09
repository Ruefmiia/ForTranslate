import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'api_client.dart';
import 'local_glossary.dart';
import 'models.dart';
import 'translation_rules_generated.dart';

class DirectApiClient {
  DirectApiClient({http.Client? client, LocalGlossary? glossary})
    : _client = client ?? http.Client(),
      _glossary = glossary ?? LocalGlossary();
  final http.Client _client;
  final LocalGlossary _glossary;
  Future<TranslationResult> translate({
    required String baseUrl,
    required String apiKey,
    required String model,
    required String text,
  }) async {
    if (apiKey.trim().isEmpty) throw const ApiException('请先填写大模型 API Key');
    final uri = Uri.tryParse(
      '${baseUrl.trim().replaceFirst(RegExp(r'/+$'), '')}/chat/completions',
    );
    if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
      throw const ApiException('API 地址格式不正确');
    }
    final terms = await _glossary.matches(text);
    final glossary = terms.isEmpty
        ? '无匹配术语。'
        : terms
              .map(
                (t) =>
                    '${t.source} => ${t.target}${t.note.isEmpty ? '' : '（${t.note}）'}',
              )
              .join('\n');
    final prompt = '$translationSystemPrompt\n\n术语表：\n$glossary';
    try {
      final r = await _client
          .post(
            uri,
            headers: {
              'Authorization': 'Bearer ${apiKey.trim()}',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({
              'model': model.trim(),
              'messages': [
                {'role': 'system', 'content': prompt},
                {'role': 'user', 'content': text},
              ],
              'temperature': 0.2,
              'response_format': {'type': 'json_object'},
            }),
          )
          .timeout(const Duration(seconds: 60));
      final data = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
      if (r.statusCode < 200 || r.statusCode >= 300) {
        final detail = (data['error'] as Map?)?['message']?.toString();
        throw ApiException(switch (r.statusCode) {
          401 || 403 => '大模型 API Key 无效或无权访问当前模型',
          429 => '大模型 API 额度不足或请求过于频繁',
          >= 500 => '大模型服务暂时不可用，请稍后重试',
          _ => detail ?? '模型 API 返回 ${r.statusCode}',
        }, statusCode: r.statusCode);
      }
      final result =
          jsonDecode(
                ((data['choices'] as List).first as Map)['message']['content']
                    .toString(),
              )
              as Map<String, dynamic>;
      final usage = data['usage'] as Map?;
      result['usage'] = {
        'input_tokens': usage?['prompt_tokens'] ?? 0,
        'output_tokens': usage?['completion_tokens'] ?? 0,
      };
      return TranslationResult.fromJson(result);
    } on TimeoutException {
      throw const ApiException('模型请求超时');
    } on SocketException {
      throw const ApiException('无法连接大模型 API');
    } on FormatException {
      throw const ApiException('模型返回的数据格式无效');
    } on http.ClientException {
      throw const ApiException('无法连接大模型 API');
    }
  }
}

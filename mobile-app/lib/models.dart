class TranslationResult {
  const TranslationResult({
    required this.translation,
    this.notes = const [],
    this.uncertainties = const [],
    this.entities = const [],
    this.inputTokens = 0,
    this.outputTokens = 0,
  });

  factory TranslationResult.fromJson(Map<String, dynamic> json) {
    final translation =
        json['translation'] ?? json['translated_text'] ?? json['text'];
    if (translation is! String || translation.trim().isEmpty) {
      throw const FormatException('服务返回了无法识别的翻译结果');
    }
    final usage = json['usage'] is Map<String, dynamic>
        ? json['usage'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return TranslationResult(
      translation: translation.trim(),
      notes: _strings(json['notes']),
      uncertainties: _strings(json['uncertainties']),
      entities: _strings(json['entities']),
      inputTokens: usage['input_tokens'] as int? ?? 0,
      outputTokens: usage['output_tokens'] as int? ?? 0,
    );
  }
  final String translation;
  final List<String> notes;
  final List<String> uncertainties;
  final List<String> entities;
  final int inputTokens;
  final int outputTokens;
  static List<String> _strings(Object? value) => value is List
      ? value.whereType<Object>().map((item) => item.toString()).toList()
      : const [];
}

class TokenBalance {
  const TokenBalance({
    required this.unlimited,
    required this.name,
    this.quotaYuan,
    this.usedYuan,
    this.remainingYuan,
    this.requests = 0,
    this.exhausted = false,
  });

  factory TokenBalance.fromJson(Map<String, dynamic> json) {
    final unlimited = json['unlimited'] == true;
    return TokenBalance(
      unlimited: unlimited,
      name: json['name']?.toString() ?? '',
      quotaYuan: unlimited ? null : _number(json['quota_yuan']),
      usedYuan: unlimited ? null : _number(json['used_yuan']),
      remainingYuan: unlimited ? null : _number(json['remaining_yuan']),
      requests: (json['requests'] as num?)?.toInt() ?? 0,
      exhausted: json['exhausted'] == true,
    );
  }

  final bool unlimited;
  final String name;
  final double? quotaYuan;
  final double? usedYuan;
  final double? remainingYuan;
  final int requests;
  final bool exhausted;

  static double? _number(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }
}

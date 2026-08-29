import 'package:flutter_test/flutter_test.dart';
import 'package:fortranslate_mobile/models.dart';

void main() {
  test('accepts compatible translation field names', () {
    expect(
      TranslationResult.fromJson({'translated_text': '中文'}).translation,
      '中文',
    );
  });

  test('rejects an empty translation response', () {
    expect(
      () => TranslationResult.fromJson({'translation': '  '}),
      throwsFormatException,
    );
  });
}

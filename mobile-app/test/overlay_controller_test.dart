import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fortranslate_mobile/overlay_controller.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ruefmiia.fortranslate/overlay');
  final calls = <MethodCall>[];

  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          if (call.method == 'history') {
            return <Map<String, Object>>[
              {'source': 'สวัสดี', 'translation': '你好', 'createdAt': 1000},
            ];
          }
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('adds a translation to native history', () async {
    final controller = OverlayController();

    await controller.addHistory(source: 'ต้นฉบับ', translation: '译文');

    expect(calls.single.method, 'addHistory');
    expect(calls.single.arguments, {'source': 'ต้นฉบับ', 'translation': '译文'});
  });

  test('reads native history entries', () async {
    final entries = await OverlayController().history();

    expect(entries, hasLength(1));
    expect(entries.single.source, 'สวัสดี');
    expect(entries.single.translation, '你好');
    expect(entries.single.createdAt.millisecondsSinceEpoch, 1000);
  });
}

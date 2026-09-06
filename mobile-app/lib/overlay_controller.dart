import 'package:flutter/services.dart';

class OverlayStatus {
  const OverlayStatus({required this.canDraw, required this.running});

  factory OverlayStatus.fromMap(Map<Object?, Object?> value) => OverlayStatus(
    canDraw: value['canDraw'] == true,
    running: value['running'] == true,
  );

  final bool canDraw;
  final bool running;
}

class OverlayLaunchRequest {
  const OverlayLaunchRequest({required this.autoTranslate});
  final bool autoTranslate;
}

class TranslationHistoryEntry {
  const TranslationHistoryEntry({
    required this.source,
    required this.translation,
    required this.createdAt,
  });

  factory TranslationHistoryEntry.fromMap(Map<Object?, Object?> value) {
    return TranslationHistoryEntry(
      source: value['source']?.toString() ?? '',
      translation: value['translation']?.toString() ?? '',
      createdAt: DateTime.fromMillisecondsSinceEpoch(
        (value['createdAt'] as num?)?.toInt() ?? 0,
      ),
    );
  }

  final String source;
  final String translation;
  final DateTime createdAt;
}

class OverlayController {
  OverlayController() : _channel = const MethodChannel(_channelName);

  static const _channelName = 'com.ruefmiia.fortranslate/overlay';
  final MethodChannel _channel;

  void setLaunchHandler(
    Future<void> Function(OverlayLaunchRequest request) handler,
  ) {
    _channel.setMethodCallHandler((call) async {
      if (call.method != 'overlayPaste') return;
      final arguments = Map<Object?, Object?>.from(call.arguments as Map);
      await handler(
        OverlayLaunchRequest(autoTranslate: arguments['autoTranslate'] == true),
      );
    });
  }

  Future<OverlayLaunchRequest?> consumeLaunchRequest() async {
    final value = await _channel.invokeMethod<Object?>('consumeLaunchRequest');
    if (value is! Map) return null;
    final arguments = Map<Object?, Object?>.from(value);
    return OverlayLaunchRequest(
      autoTranslate: arguments['autoTranslate'] == true,
    );
  }

  Future<OverlayStatus> status() async {
    final value = await _channel.invokeMapMethod<Object?, Object?>('status');
    return OverlayStatus.fromMap(value ?? const {});
  }

  Future<bool> requestPermission() async =>
      await _channel.invokeMethod<bool>('requestPermission') ?? false;

  Future<bool> start({
    required bool autoTranslate,
    required String mode,
    required String token,
    required String llmBaseUrl,
    required String llmModel,
    required String llmApiKey,
  }) async =>
      await _channel.invokeMethod<bool>('start', {
        'autoTranslate': autoTranslate,
        'mode': mode,
        'token': token,
        'llmBaseUrl': llmBaseUrl,
        'llmModel': llmModel,
        'llmApiKey': llmApiKey,
      }) ??
      false;

  Future<void> stop() => _channel.invokeMethod<void>('stop');

  Future<void> addHistory({
    required String source,
    required String translation,
  }) => _channel.invokeMethod<void>('addHistory', {
    'source': source,
    'translation': translation,
  });

  Future<List<TranslationHistoryEntry>> history() async {
    final value = await _channel.invokeListMethod<Object?>('history');
    return (value ?? const <Object?>[])
        .whereType<Map>()
        .map(
          (item) =>
              TranslationHistoryEntry.fromMap(Map<Object?, Object?>.from(item)),
        )
        .toList();
  }
}

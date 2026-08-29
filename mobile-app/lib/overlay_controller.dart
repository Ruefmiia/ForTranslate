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

  Future<bool> start({required bool autoTranslate}) async =>
      await _channel.invokeMethod<bool>('start', {
        'autoTranslate': autoTranslate,
      }) ??
      false;

  Future<void> stop() => _channel.invokeMethod<void>('stop');
}

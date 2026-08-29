import 'dart:convert';
import 'package:flutter/services.dart';

class GlossaryTerm {
  const GlossaryTerm(this.source, this.target, this.note);
  final String source, target, note;
}

class LocalGlossary {
  List<GlossaryTerm>? _terms;
  Future<List<GlossaryTerm>> matches(String text) async {
    _terms ??= await _load();
    return _terms!.where((t) => text.contains(t.source)).take(40).toList();
  }

  Future<List<GlossaryTerm>> _load() async {
    final data =
        jsonDecode(await rootBundle.loadString('assets/glossary.json'))
            as Map<String, dynamic>;
    final terms = (data['terms'] as List).map((e) {
      final v = e as Map<String, dynamic>;
      return GlossaryTerm(
        v['source'] as String,
        v['target'] as String,
        v['note']?.toString() ?? '',
      );
    }).toList();
    terms.sort((a, b) => b.source.length.compareTo(a.source.length));
    return terms;
  }
}

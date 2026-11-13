import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';

/// Saved deals stay on this phone only (no account needed), like the website.
class SavedStore extends ChangeNotifier {
  static const _key = 'saved_deals_v1';
  final Map<String, Deal> _deals = {};

  List<Deal> get deals => _deals.values.toList().reversed.toList();
  bool isSaved(String id) => _deals.containsKey(id);

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    for (final raw in prefs.getStringList(_key) ?? const <String>[]) {
      try {
        final deal = Deal.fromJson((jsonDecode(raw) as Map).cast<String, dynamic>());
        _deals[deal.id] = deal;
      } catch (_) {/* skip a damaged entry */}
    }
    notifyListeners();
  }

  Future<void> toggle(Deal deal) async {
    if (_deals.remove(deal.id) == null) _deals[deal.id] = deal;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _deals.values.map((d) => jsonEncode(d.toJson())).toList());
    notifyListeners();
  }
}

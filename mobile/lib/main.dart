import 'package:flutter/material.dart';
import 'api.dart';
import 'saved_store.dart';
import 'screens.dart';
import 'web_tab.dart';
import 'widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final saved = SavedStore();
  await saved.load();
  runApp(MetaDealsApp(api: Api(), saved: saved));
}

class MetaDealsApp extends StatelessWidget {
  const MetaDealsApp({super.key, required this.api, required this.saved});
  final Api api;
  final SavedStore saved;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'MetaDeals4U',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: brandPurple),
          scaffoldBackgroundColor: const Color(0xFFF1F0FF),
          appBarTheme: const AppBarTheme(backgroundColor: Color(0xFFF1F0FF), surfaceTintColor: Colors.transparent),
          cardTheme: const CardThemeData(color: Colors.white, elevation: 1),
        ),
        home: Shell(api: api, saved: saved),
      );
}

/// Deals are native; Forum, Post a Deal and Account are the website's pages inside the app (same sign-in as the website).
class Shell extends StatefulWidget {
  const Shell({super.key, required this.api, required this.saved});
  final Api api;
  final SavedStore saved;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;
  final _opened = <int>{0};

  @override
  Widget build(BuildContext context) {
    final tabs = <Widget Function()>[
      () => HomeScreen(api: widget.api, saved: widget.saved),
      () => const WebTab(path: '/community', title: 'Forum'),
      () => const WebTab(path: '/post-deal', title: 'Post a Deal'),
      () => const WebTab(path: '/account', title: 'Account'),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: [for (var i = 0; i < tabs.length; i++) _opened.contains(i) ? tabs[i]() : const SizedBox.shrink()]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() { _index = i; _opened.add(i); }),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer), label: 'Deals'),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: 'Forum'),
          NavigationDestination(icon: Icon(Icons.add_circle_outline), selectedIcon: Icon(Icons.add_circle), label: 'Post'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
        ],
      ),
    );
  }
}

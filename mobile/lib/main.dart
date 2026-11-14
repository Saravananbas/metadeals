import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'brand.dart';
import 'onboarding.dart';
import 'saved_store.dart';
import 'screens.dart';
import 'web_tab.dart';
import 'widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final saved = SavedStore();
  await saved.load();
  sharedSaved = saved;
  final prefs = await SharedPreferences.getInstance();
  appStage.value = (prefs.getBool('onboarded_v1') ?? false) ? Stage.login : Stage.onboarding;
  runApp(MetaDealsApp(api: Api(), saved: saved));
}

class MetaDealsApp extends StatelessWidget {
  const MetaDealsApp({super.key, required this.api, required this.saved});
  final Api api;
  final SavedStore saved;

  Future<void> _finishOnboarding() async {
    (await SharedPreferences.getInstance()).setBool('onboarded_v1', true);
    appStage.value = Stage.login;
  }

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
        home: ValueListenableBuilder<Stage>(
          valueListenable: appStage,
          builder: (_, stage, _) => switch (stage) {
            Stage.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
            Stage.onboarding => Onboarding(onDone: _finishOnboarding),
            Stage.login => LoginGate(onDone: () => appStage.value = Stage.app, onSkip: () => appStage.value = Stage.app),
            Stage.app => Shell(api: api, saved: saved),
          },
        ),
      );
}

/// Logo and profile on top of every page; Home, Submit a Deal, Forum and New Post at the bottom.
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
      () => const WebTab(path: '/post-deal'),
      () => const WebTab(path: '/community'),
      () => const WebTab(path: '/community/submit'),
    ];
    return Scaffold(
      appBar: const BrandAppBar(),
      body: IndexedStack(index: _index, children: [for (var i = 0; i < tabs.length; i++) _opened.contains(i) ? tabs[i]() : const SizedBox.shrink()]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() { _index = i; _opened.add(i); }),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer), label: 'Submit a Deal'),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: 'Forum'),
          NavigationDestination(icon: Icon(Icons.edit_outlined), selectedIcon: Icon(Icons.edit), label: 'New Post'),
        ],
      ),
    );
  }
}

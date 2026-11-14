import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'saved_store.dart';
import 'web_tab.dart';
import 'widgets.dart';

/// Which part of the app is showing: first-run slides, the sign-in page, or the app itself.
enum Stage { loading, onboarding, login, app }

final ValueNotifier<Stage> appStage = ValueNotifier(Stage.loading);

/// The store handed to the profile menu so "Saved deals" works from every page.
SavedStore? sharedSaved;

/// The MetaDeals4U mark (same bag as the website and the app icon).
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 32, this.withName = true});
  final double size;
  final bool withName;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        ClipRRect(borderRadius: BorderRadius.circular(size * 0.28), child: Image.asset('assets/icon.png', width: size, height: size)),
        if (withName) ...[
          SizedBox(width: size * 0.3),
          Text('MetaDeals4U', style: TextStyle(fontWeight: FontWeight.w800, fontSize: size * 0.62, color: brandPurple)),
        ],
      ]);
}

/// Profile menu, same choices as the website's profile icon: Manage profile, Submitted deals, Saved deals, Sign out.
class ProfileButton extends StatelessWidget {
  const ProfileButton({super.key});

  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
        tooltip: 'Profile',
        icon: const CircleAvatar(radius: 17, backgroundColor: Color(0xFFEDE9FE), child: Icon(Icons.person, color: brandPurple, size: 20)),
        onSelected: (value) async {
          final nav = Navigator.of(context);
          switch (value) {
            case 'profile':
              nav.push(MaterialPageRoute(builder: (_) => const WebPage(path: '/account', title: 'Manage profile')));
            case 'submitted':
              nav.push(MaterialPageRoute(builder: (_) => const WebPage(path: '/post-deal', title: 'Submitted deals')));
            case 'saved':
              final saved = sharedSaved;
              if (saved != null) nav.push(MaterialPageRoute(builder: (_) => SavedPage(saved: saved)));
            case 'about':
              nav.push(MaterialPageRoute(builder: (_) => const WebPage(path: '/privacy', title: 'Privacy policy')));
            case 'signout':
              // The website's sign-in lives in the web view's cookies: clearing them signs the member out.
              await WebViewCookieManager().clearCookies();
              nav.popUntil((route) => route.isFirst);
              appStage.value = Stage.login;
          }
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'profile', child: ListTile(leading: Icon(Icons.manage_accounts_outlined), title: Text('Manage profile'), dense: true)),
          PopupMenuItem(value: 'submitted', child: ListTile(leading: Icon(Icons.assignment_outlined), title: Text('Submitted deals'), dense: true)),
          PopupMenuItem(value: 'saved', child: ListTile(leading: Icon(Icons.favorite_border), title: Text('Saved deals'), dense: true)),
          PopupMenuItem(value: 'about', child: ListTile(leading: Icon(Icons.privacy_tip_outlined), title: Text('Privacy policy'), dense: true)),
          PopupMenuDivider(),
          PopupMenuItem(value: 'signout', child: ListTile(leading: Icon(Icons.logout), title: Text('Sign out'), dense: true)),
        ],
      );
}

/// Top bar for every page: the MetaDeals4U logo on the left, the profile icon on the right.
class BrandAppBar extends StatelessWidget implements PreferredSizeWidget {
  const BrandAppBar({super.key, this.showBack = false});
  final bool showBack;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) => AppBar(
        automaticallyImplyLeading: false,
        leading: showBack ? IconButton(tooltip: 'Back', icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.of(context).maybePop()) : null,
        titleSpacing: showBack ? 0 : 16,
        title: const BrandLogo(),
        actions: const [ProfileButton(), SizedBox(width: 8)],
      );
}

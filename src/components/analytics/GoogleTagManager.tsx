import "server-only";

// Set NEXT_PUBLIC_GTM_ID (empty to switch off) before the build. Production builds only, so local work never counts as visits.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-NM5TR8GZ";

/**
 * Google Tag Manager (Google Analytics runs inside it), written into the page's own HTML head so Google's tag check can see it.
 * Consent mode starts with everything denied: no analytics or advertising cookies are set until the visitor presses Accept (stored as md_consent=accepted);
 * Decline keeps them off. Never loaded on /admin, /moderator or /messages.
 * shortcut: no <noscript> fallback, because a visitor without scripts cannot give consent.
 */
export function GoogleTagManager() {
  if (!GTM_ID || process.env.NODE_ENV !== "production") return null;
  const code = `(function(){if(['admin','moderator','messages'].indexOf(location.pathname.split('/')[1])>-1)return;
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
var accepted=false;try{accepted=localStorage.getItem('md_consent')==='accepted';}catch(e){}
if(accepted)gtag('consent','update',{analytics_storage:'granted'});
window.addEventListener('md-consent-change',function(){try{if(localStorage.getItem('md_consent')==='accepted')gtag('consent','update',{analytics_storage:'granted'});}catch(e){}});
gtag('js',new Date());
var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}';document.head.appendChild(s);})();`;
  return <script id="gtm-loader" dangerouslySetInnerHTML={{ __html: code }} />;
}

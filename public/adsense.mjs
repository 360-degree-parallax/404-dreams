// Supply the real display ad unit ID in index.html's adsense-download-slot meta.
// An empty value leaves the download placement absent; no placeholder ad requests.
const slot = document.querySelector('meta[name="adsense-download-slot"]')?.content.trim();
const placement = document.getElementById('downloadAd');
if (placement && /^\d+$/.test(slot || '')) {
  const ad = document.createElement('ins');
  ad.className = 'adsbygoogle';
  ad.dataset.adClient = 'ca-pub-2153254672041591';
  ad.dataset.adSlot = slot;
  ad.dataset.adFormat = 'auto';
  ad.dataset.fullWidthResponsive = 'true';
  placement.append(ad);
  placement.hidden = false;
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}

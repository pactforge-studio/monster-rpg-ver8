/* The old game stays available as a recovery path; the new host never redirects. */
if (location.origin === 'https://kankidoi2-byte.github.io' && new URLSearchParams(location.search).get('legacy') !== '1') {
  location.replace('/monster-rpg-ver8/url-transfer.html?v=2');
}

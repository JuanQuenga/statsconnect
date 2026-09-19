/**
 * Browser regression probe. Pass this function to Playwright page.evaluate on
 * the Clash home page at 390, 680, 681, 768, 820, 860, 861, 1024, and 1280px.
 * Reads the rendered layout, not CSS source text. Run with the menu closed.
 */
export function checkClashNavigation() {
  const nav = document.querySelector('.sc-nav[data-site="clash-royale"]');
  if (!nav) throw new Error("Open the Clash Royale app before running this check.");
  const bounds = (selector) => nav.querySelector(selector)?.getBoundingClientRect();
  const header = nav.getBoundingClientRect();
  const network = bounds(".sc-nav__network");
  const menu = bounds(".sc-nav__menu-button");
  const links = bounds(".sc-nav__links");
  const dock = bounds(".sc-nav__mobile-dock");
  const site = nav.querySelector(".sc-nav__site");
  const failures = [];
  if (document.documentElement.scrollWidth > innerWidth) failures.push("Horizontal page overflow");
  if (innerWidth <= 680) {
    if (header.height !== 0 || !dock?.height) failures.push("Mobile dock layout is missing");
  } else if (innerWidth <= 860) {
    if (header.height > 60 || header.height !== network?.height) failures.push("Empty tablet navigation row");
    if (!menu?.height || menu.top < header.top || menu.bottom > header.bottom) failures.push("Menu is outside the compact bar");
    if (site && getComputedStyle(site).backdropFilter !== "none") failures.push("Menu overlay blurs the network links");
  } else if (!links?.height || menu?.height) {
    failures.push("Desktop navigation did not replace the compact menu");
  }
  if (failures.length) throw new Error(`${innerWidth}px: ${failures.join("; ")}`);
  return { width: innerWidth, headerHeight: header.height, passed: true };
}

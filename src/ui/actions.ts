/** 掛載時自動聚焦（取代會觸發 a11y 警告的 autofocus 屬性）。 */
export function focusOnMount(node: HTMLElement): void {
  node.focus();
}

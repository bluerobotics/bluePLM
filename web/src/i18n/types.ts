/**
 * A web translation dictionary: strings nested to any depth, flattened to dot keys at load.
 * The desktop's TranslationDict caps nesting at three levels; the web namespaces sit one level
 * deeper (`reviews.detail.actions.approve`), so they use this type instead.
 */
export interface WebDict {
  [key: string]: string | WebDict
}

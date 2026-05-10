export function renderRepositorySetupNote(product: string): string {
  return [
    `Dev repo: ${product}_dev`,
    `Module repo: ${product}`,
    `Local folder: ./${product}_dev`,
    `Submodule path: odoo/custom/src/private/${product}`,
  ].join('\n');
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
export function listEndpoints(app) {
  const table = [];
  for (const r of app._router.stack) {
    if (r.route && r.route.path) {
      const methods = Object.keys(r.route.methods).join(', ').toUpperCase();
      table.push({
        Path: r.route.path,
        Methods: methods
      });
    }
  }
  console.table(table);
}

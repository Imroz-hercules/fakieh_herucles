/** Material codes mirrored from PLC XML — shared by Orders and Truck Weighbridge. */

export interface MaterialCode {
  code: string;
  name: string;
}

export const MATERIAL_CODES: MaterialCode[] = [
  { code: "None", name: "None" },
  { code: "002", name: "Soya" },
  { code: "5000", name: "PRODUCT1" },
  { code: "202", name: "Salt" },
  { code: "000", name: "Empty" },
  { code: "100", name: "Yellow Maize 7.8%" },
  { code: "112", name: "Bran 15.7%" },
  { code: "105", name: "Soya O/C 47.5%" },
  { code: "210", name: "Soya Oil" },
  { code: "113", name: "Limestone 36%" },
  { code: "204", name: "Monocalcium Phos" },
  { code: "035", name: "Sodium Bicarbonate" },
  { code: "012", name: "DL Methionine" },
  { code: "073", name: "L Isoleucine" },
  { code: "060", name: "L Threonine" },
  { code: "072", name: "L Valine" },
  { code: "8", name: "Lysine HCL" },
  { code: "71", name: "Broiler Finisher PX" },
  { code: "70", name: "Broiler Grower PX" },
  { code: "31", name: "Broiler Mineral Mix" },
  { code: "69", name: "Broiler Starter PX" },
  { code: "26", name: "Choline Chloride" },
  { code: "21", name: "Provi Oxi Stop" },
  { code: "132", name: "Salmocid - F" },
  { code: "79", name: "Sangrovit" },
  { code: "62", name: "Econase XT25(100g)" },
  { code: "44", name: "Phytase 10000 1000FTU (100g)" },
  { code: "91", name: "Sacox (500g)" },
  { code: "49", name: "Pelcin" },
  { code: "300", name: "Water" },
];

export function getMaterialNameFromCode(materialCode: string | number | null | undefined): string {
  if (!materialCode || materialCode === "") return "-";
  const material = MATERIAL_CODES.find((m) => m.code === String(materialCode));
  return material ? material.name : String(materialCode);
}

/** Materials selectable on truck entry (excludes None / Empty). */
export function getSelectableMaterialCodes(): MaterialCode[] {
  return MATERIAL_CODES.filter((m) => m.code !== "None" && m.code !== "000");
}

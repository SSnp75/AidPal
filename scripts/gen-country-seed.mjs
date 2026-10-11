// Generates supabase/seeds/countries.sql from an ISO 3166-1 alpha-2 list.
// Flag emoji is computed from the 2-letter code (regional indicator symbols).
// Run: node scripts/gen-country-seed.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// code -> English short name. Filled in by appended batches below.
const COUNTRIES = {};
Object.assign(COUNTRIES, {
  AF: "Afghanistan", AX: "Åland Islands", AL: "Albania", DZ: "Algeria",
  AS: "American Samoa", AD: "Andorra", AO: "Angola", AI: "Anguilla",
  AQ: "Antarctica", AG: "Antigua and Barbuda", AR: "Argentina", AM: "Armenia",
  AW: "Aruba", AU: "Australia", AT: "Austria", AZ: "Azerbaijan",
  BS: "Bahamas", BH: "Bahrain", BD: "Bangladesh", BB: "Barbados",
  BY: "Belarus", BE: "Belgium", BZ: "Belize", BJ: "Benin",
  BM: "Bermuda", BT: "Bhutan", BO: "Bolivia", BQ: "Bonaire, Sint Eustatius and Saba",
  BA: "Bosnia and Herzegovina", BW: "Botswana", BV: "Bouvet Island", BR: "Brazil",
  IO: "British Indian Ocean Territory", BN: "Brunei Darussalam", BG: "Bulgaria",
  BF: "Burkina Faso", BI: "Burundi",
});
Object.assign(COUNTRIES, {
  CV: "Cabo Verde", KH: "Cambodia", CM: "Cameroon", CA: "Canada",
  KY: "Cayman Islands", CF: "Central African Republic", TD: "Chad", CL: "Chile",
  CN: "China", CX: "Christmas Island", CC: "Cocos (Keeling) Islands", CO: "Colombia",
  KM: "Comoros", CG: "Congo", CD: "Congo (Democratic Republic)", CK: "Cook Islands",
  CR: "Costa Rica", CI: "Côte d'Ivoire", HR: "Croatia", CU: "Cuba",
  CW: "Curaçao", CY: "Cyprus", CZ: "Czechia", DK: "Denmark",
  DJ: "Djibouti", DM: "Dominica", DO: "Dominican Republic", EC: "Ecuador",
  EG: "Egypt", SV: "El Salvador", GQ: "Equatorial Guinea", ER: "Eritrea",
  EE: "Estonia", SZ: "Eswatini", ET: "Ethiopia", FK: "Falkland Islands",
  FO: "Faroe Islands", FJ: "Fiji", FI: "Finland", FR: "France",
  GF: "French Guiana", PF: "French Polynesia", TF: "French Southern Territories",
  GA: "Gabon", GM: "Gambia", GE: "Georgia", DE: "Germany",
  GH: "Ghana", GI: "Gibraltar", GR: "Greece", GL: "Greenland",
  GD: "Grenada", GP: "Guadeloupe", GU: "Guam", GT: "Guatemala",
  GG: "Guernsey", GN: "Guinea", GW: "Guinea-Bissau", GY: "Guyana",
});
Object.assign(COUNTRIES, {
  HT: "Haiti", HM: "Heard Island and McDonald Islands", VA: "Holy See",
  HN: "Honduras", HK: "Hong Kong", HU: "Hungary", IS: "Iceland",
  IN: "India", ID: "Indonesia", IR: "Iran", IQ: "Iraq",
  IE: "Ireland", IM: "Isle of Man", IL: "Israel", IT: "Italy",
  JM: "Jamaica", JP: "Japan", JE: "Jersey", JO: "Jordan",
  KZ: "Kazakhstan", KE: "Kenya", KI: "Kiribati", KP: "North Korea",
  KR: "South Korea", KW: "Kuwait", KG: "Kyrgyzstan", LA: "Laos",
  LV: "Latvia", LB: "Lebanon", LS: "Lesotho", LR: "Liberia",
  LY: "Libya", LI: "Liechtenstein", LT: "Lithuania", LU: "Luxembourg",
  MO: "Macao", MG: "Madagascar", MW: "Malawi", MY: "Malaysia",
  MV: "Maldives", ML: "Mali", MT: "Malta", MH: "Marshall Islands",
  MQ: "Martinique", MR: "Mauritania", MU: "Mauritius", YT: "Mayotte",
  MX: "Mexico", FM: "Micronesia", MD: "Moldova", MC: "Monaco",
  MN: "Mongolia", ME: "Montenegro", MS: "Montserrat", MA: "Morocco",
  MZ: "Mozambique", MM: "Myanmar",
});
Object.assign(COUNTRIES, {
  NA: "Namibia", NR: "Nauru", NP: "Nepal", NL: "Netherlands",
  NC: "New Caledonia", NZ: "New Zealand", NI: "Nicaragua", NE: "Niger",
  NG: "Nigeria", NU: "Niue", NF: "Norfolk Island", MK: "North Macedonia",
  MP: "Northern Mariana Islands", NO: "Norway", OM: "Oman", PK: "Pakistan",
  PW: "Palau", PS: "Palestine", PA: "Panama", PG: "Papua New Guinea",
  PY: "Paraguay", PE: "Peru", PH: "Philippines", PN: "Pitcairn",
  PL: "Poland", PT: "Portugal", PR: "Puerto Rico", QA: "Qatar",
  RE: "Réunion", RO: "Romania", RU: "Russia", RW: "Rwanda",
  BL: "Saint Barthélemy", SH: "Saint Helena", KN: "Saint Kitts and Nevis",
  LC: "Saint Lucia", MF: "Saint Martin", PM: "Saint Pierre and Miquelon",
  VC: "Saint Vincent and the Grenadines", WS: "Samoa", SM: "San Marino",
  ST: "Sao Tome and Principe", SA: "Saudi Arabia", SN: "Senegal", RS: "Serbia",
  SC: "Seychelles", SL: "Sierra Leone", SG: "Singapore", SX: "Sint Maarten",
  SK: "Slovakia", SI: "Slovenia", SB: "Solomon Islands", SO: "Somalia",
  ZA: "South Africa", GS: "South Georgia and the South Sandwich Islands",
  SS: "South Sudan", ES: "Spain", LK: "Sri Lanka", SD: "Sudan",
  SR: "Suriname", SJ: "Svalbard and Jan Mayen", SE: "Sweden", CH: "Switzerland",
  SY: "Syria",
});
Object.assign(COUNTRIES, {
  TW: "Taiwan", TJ: "Tajikistan", TZ: "Tanzania", TH: "Thailand",
  TL: "Timor-Leste", TG: "Togo", TK: "Tokelau", TO: "Tonga",
  TT: "Trinidad and Tobago", TN: "Tunisia", TR: "Türkiye", TM: "Turkmenistan",
  TC: "Turks and Caicos Islands", TV: "Tuvalu", UG: "Uganda", UA: "Ukraine",
  AE: "United Arab Emirates", GB: "United Kingdom", US: "United States",
  UM: "United States Minor Outlying Islands", UY: "Uruguay", UZ: "Uzbekistan",
  VU: "Vanuatu", VE: "Venezuela", VN: "Vietnam", VG: "Virgin Islands (British)",
  VI: "Virgin Islands (U.S.)", WF: "Wallis and Futuna", EH: "Western Sahara",
  YE: "Yemen", ZM: "Zambia", ZW: "Zimbabwe",
});

function flagEmoji(code) {
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + code.charCodeAt(0) - 65,
    A + code.charCodeAt(1) - 65
  );
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

const rows = Object.entries(COUNTRIES)
  .sort((a, b) => a[1].localeCompare(b[1]))
  .map(
    ([code, name]) =>
      `  ('${code}', '${sqlEscape(name)}', '${flagEmoji(code)}')`
  )
  .join(",\n");

const sql = `-- Generated by scripts/gen-country-seed.mjs — do not edit by hand.
-- ISO 3166-1 alpha-2 countries. Idempotent: safe to re-run.
insert into public.countries (code, name, flag) values
${rows}
on conflict (code) do nothing;
`;

const outDir = join(root, "supabase", "seeds");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "countries.sql"), sql, "utf8");
console.log(
  `Wrote supabase/seeds/countries.sql with ${Object.keys(COUNTRIES).length} countries.`
);

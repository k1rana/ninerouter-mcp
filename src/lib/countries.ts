/**
 * Country name <-> ISO 3166-1 alpha-2 conversion for the `country` search filter:
 * Tavily wants a country name, Serper and friends want an ISO code.
 */

/**
 * Lookup key. Case, accents and separators are folded away, so "Côte d'Ivoire"
 * and "cote divoire" resolve to the same country.
 */
function normalizeKey(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * ISO 3166-1 alpha-2 code -> country name, spelled the way Tavily lists them.
 * Tavily accepts only these names, so the list stays as long as its enum.
 */
const COUNTRY_LIST: ReadonlyArray<readonly [string, string]> = [
    ['af', 'afghanistan'],
    ['al', 'albania'],
    ['dz', 'algeria'],
    ['ad', 'andorra'],
    ['ao', 'angola'],
    ['ar', 'argentina'],
    ['am', 'armenia'],
    ['au', 'australia'],
    ['at', 'austria'],
    ['az', 'azerbaijan'],
    ['bs', 'bahamas'],
    ['bh', 'bahrain'],
    ['bd', 'bangladesh'],
    ['bb', 'barbados'],
    ['by', 'belarus'],
    ['be', 'belgium'],
    ['bz', 'belize'],
    ['bj', 'benize'],
    ['bt', 'bhutan'],
    ['bo', 'bolivia'],
    ['ba', 'bosnia and herzegovina'],
    ['bw', 'botswana'],
    ['br', 'brazil'],
    ['bn', 'brunei'],
    ['bg', 'bulgaria'],
    ['bf', 'burkina faso'],
    ['bi', 'burundi'],
    ['kh', 'cambodia'],
    ['cm', 'cameroon'],
    ['ca', 'canada'],
    ['cv', 'cape verde'],
    ['cf', 'central african republic'],
    ['td', 'chad'],
    ['cl', 'chile'],
    ['cn', 'china'],
    ['co', 'colombia'],
    ['km', 'comoros'],
    ['cg', 'congo'],
    ['cr', 'costa rica'],
    ['hr', 'croatia'],
    ['cu', 'cuba'],
    ['cy', 'cyprus'],
    ['cz', 'czech republic'],
    ['dk', 'denmark'],
    ['dj', 'djibouti'],
    ['do', 'dominican republic'],
    ['ec', 'ecuador'],
    ['eg', 'egypt'],
    ['sv', 'el salvador'],
    ['gq', 'equatorial guinea'],
    ['er', 'eritrea'],
    ['ee', 'estonia'],
    ['et', 'ethiopia'],
    ['fj', 'fiji'],
    ['fi', 'finland'],
    ['fr', 'france'],
    ['ga', 'gabon'],
    ['gm', 'gambia'],
    ['ge', 'georgia'],
    ['de', 'germany'],
    ['gh', 'ghana'],
    ['gr', 'greece'],
    ['gt', 'guatemala'],
    ['gn', 'guinea'],
    ['ht', 'haiti'],
    ['hn', 'honduras'],
    ['hu', 'hungary'],
    ['is', 'iceland'],
    ['in', 'india'],
    ['id', 'indonesia'],
    ['ir', 'iran'],
    ['iq', 'iraq'],
    ['ie', 'ireland'],
    ['il', 'israel'],
    ['it', 'italy'],
    ['jm', 'jamaica'],
    ['jp', 'japan'],
    ['jo', 'jordan'],
    ['kz', 'kazakhstan'],
    ['ke', 'kenya'],
    ['kw', 'kuwait'],
    ['kg', 'kyrgyzstan'],
    ['lv', 'latvia'],
    ['lb', 'lebanon'],
    ['ls', 'lesotho'],
    ['lr', 'liberia'],
    ['ly', 'libya'],
    ['li', 'liechtenstein'],
    ['lt', 'lithuania'],
    ['lu', 'luxembourg'],
    ['mg', 'madagascar'],
    ['mw', 'malawi'],
    ['my', 'malaysia'],
    ['mv', 'maldives'],
    ['ml', 'mali'],
    ['mt', 'malta'],
    ['mr', 'mauritania'],
    ['mu', 'mauritius'],
    ['mx', 'mexico'],
    ['md', 'moldova'],
    ['mc', 'monaco'],
    ['mn', 'mongolia'],
    ['me', 'montenegro'],
    ['ma', 'morocco'],
    ['mz', 'mozambique'],
    ['mm', 'myanmar'],
    ['na', 'namibia'],
    ['np', 'nepal'],
    ['nl', 'netherlands'],
    ['nz', 'new zealand'],
    ['ni', 'nicaragua'],
    ['ne', 'niger'],
    ['ng', 'nigeria'],
    ['kp', 'north korea'],
    ['mk', 'north macedonia'],
    ['no', 'norway'],
    ['om', 'oman'],
    ['pk', 'pakistan'],
    ['pa', 'panama'],
    ['pg', 'papua new guinea'],
    ['py', 'paraguay'],
    ['pe', 'peru'],
    ['ph', 'philippines'],
    ['pl', 'poland'],
    ['pt', 'portugal'],
    ['qa', 'qatar'],
    ['ro', 'romania'],
    ['ru', 'russia'],
    ['rw', 'rwanda'],
    ['sa', 'saudi arabia'],
    ['sn', 'senegal'],
    ['rs', 'serbia'],
    ['sg', 'singapore'],
    ['sk', 'slovakia'],
    ['si', 'slovenia'],
    ['so', 'somalia'],
    ['za', 'south africa'],
    ['kr', 'south korea'],
    ['ss', 'south sudan'],
    ['es', 'spain'],
    ['lk', 'sri lanka'],
    ['sd', 'sudan'],
    ['se', 'sweden'],
    ['ch', 'switzerland'],
    ['sy', 'syria'],
    ['tw', 'taiwan'],
    ['tj', 'tajikistan'],
    ['tz', 'tanzania'],
    ['th', 'thailand'],
    ['tg', 'togo'],
    ['tt', 'trinidad and tobago'],
    ['tn', 'tunisia'],
    ['tr', 'turkey'],
    ['tm', 'turkmenistan'],
    ['ug', 'uganda'],
    ['ua', 'ukraine'],
    ['ae', 'united arab emirates'],
    ['gb', 'united kingdom'],
    ['us', 'united states'],
    ['uy', 'uruguay'],
    ['uz', 'uzbekistan'],
    ['ve', 'venezuela'],
    ['vn', 'vietnam'],
    ['ye', 'yemen'],
    ['zm', 'zambia'],
    ['zw', 'zimbabwe'],
];

/**
 * Names outside the list above, plus the spellings agents actually produce.
 * They resolve to a code but have no country-name form.
 */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
    'aland islands': 'ax',
    'american samoa': 'as',
    anguilla: 'ai',
    antarctica: 'aq',
    'antigua and barbuda': 'ag',
    aruba: 'aw',
    bermuda: 'bm',
    bosnia: 'ba',
    'bouvet island': 'bv',
    'british indian ocean territory': 'io',
    'british virgin islands': 'vg',
    burma: 'mm',
    'cape verde islands': 'cv',
    'caribbean netherlands': 'bq',
    'cayman islands': 'ky',
    'christmas island': 'cx',
    'cocos keeling islands': 'cc',
    'congo brazzaville': 'cg',
    'congo kinshasa': 'cd',
    'cook islands': 'ck',
    'cote d ivoire': 'ci',
    'cote divoire': 'ci',
    curacao: 'cw',
    czechia: 'cz',
    'democratic republic of the congo': 'cd',
    dominica: 'dm',
    'dr congo': 'cd',
    'east timor': 'tl',
    england: 'gb',
    eswatini: 'sz',
    'falkland islands': 'fk',
    'faroe islands': 'fo',
    'french guiana': 'gf',
    'french polynesia': 'pf',
    'french southern territories': 'tf',
    gibraltar: 'gi',
    'great britain': 'gb',
    greenland: 'gl',
    grenada: 'gd',
    guadeloupe: 'gp',
    guam: 'gu',
    guernsey: 'gg',
    'guinea bissau': 'gw',
    guyana: 'gy',
    'heard and mcdonald islands': 'hm',
    holland: 'nl',
    'hong kong': 'hk',
    'hong kong sar china': 'hk',
    'isle of man': 'im',
    'ivory coast': 'ci',
    jersey: 'je',
    kiribati: 'ki',
    korea: 'kr',
    laos: 'la',
    'macao sar china': 'mo',
    macedonia: 'mk',
    'marshall islands': 'mh',
    martinique: 'mq',
    mayotte: 'yt',
    micronesia: 'fm',
    montserrat: 'ms',
    'myanmar burma': 'mm',
    nauru: 'nr',
    'new caledonia': 'nc',
    niue: 'nu',
    'norfolk island': 'nf',
    'northern ireland': 'gb',
    'northern mariana islands': 'mp',
    palau: 'pw',
    palestine: 'ps',
    'palestinian territories': 'ps',
    'pitcairn islands': 'pn',
    'puerto rico': 'pr',
    'republic of korea': 'kr',
    reunion: 're',
    'russian federation': 'ru',
    samoa: 'ws',
    'san marino': 'sm',
    'sao tome and principe': 'st',
    scotland: 'gb',
    seychelles: 'sc',
    'sierra leone': 'sl',
    'sint maarten': 'sx',
    'slovak republic': 'sk',
    'solomon islands': 'sb',
    'south georgia and south sandwich islands': 'gs',
    'south korean republic': 'kr',
    'sri lanka': 'lk',
    'st barthelemy': 'bl',
    'st helena': 'sh',
    'st kitts and nevis': 'kn',
    'st lucia': 'lc',
    'st martin': 'mf',
    'st pierre and miquelon': 'pm',
    'st vincent and grenadines': 'vc',
    suriname: 'sr',
    'svalbard and jan mayen': 'sj',
    swaziland: 'sz',
    'timor leste': 'tl',
    tokelau: 'tk',
    tonga: 'to',
    'trinidad tobago': 'tt',
    'turks and caicos islands': 'tc',
    tuvalu: 'tv',
    'u s': 'us',
    'u k': 'gb',
    'u s outlying islands': 'um',
    'u s virgin islands': 'vi',
    'u.s.a.': 'us',
    uae: 'ae',
    'united states of america': 'us',
    usa: 'us',
    vanuatu: 'vu',
    vatican: 'va',
    'vatican city': 'va',
    'wallis and futuna': 'wf',
    wales: 'gb',
    'western sahara': 'eh',
};

const CODE_TO_NAME = new Map<string, string>(COUNTRY_LIST);

const NAME_TO_CODE = new Map<string, string>();
for (const [code, name] of COUNTRY_LIST) {
    NAME_TO_CODE.set(normalizeKey(name), code);
}
for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
    NAME_TO_CODE.set(normalizeKey(alias), code);
}

/** True for anything shaped like an ISO 3166-1 alpha-2 code, known or not. */
export function isCountryCode(value: string): boolean {
    return /^[a-z]{2}$/.test(value.trim().toLowerCase());
}

/**
 * Country name or ISO code -> ISO 3166-1 alpha-2 code.
 * Returns undefined when the value names no known country.
 */
export function toCountryCode(value: string): string | undefined {
    const key = normalizeKey(value);
    if (!key) {
        return undefined;
    }
    return NAME_TO_CODE.get(key) ?? (isCountryCode(key) ? key : undefined);
}

/**
 * Country name or ISO code -> the country name Tavily accepts.
 * Returns undefined when no name form is known.
 */
export function toCountryName(value: string): string | undefined {
    const key = normalizeKey(value);
    if (!key) {
        return undefined;
    }
    const direct = CODE_TO_NAME.get(key);
    if (direct) {
        return direct;
    }
    const code = NAME_TO_CODE.get(key);
    return code ? CODE_TO_NAME.get(code) : undefined;
}

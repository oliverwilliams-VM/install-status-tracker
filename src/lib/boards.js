// Install \u2192 BAU boards, one per country. Column IDs genuinely differ
// between boards (they were built independently, not cloned from a single
// template) \u2014 verified against a real columns-helper dump before writing
// any of this, same discipline as every other dashboard in this project.
//
// Two fields are NOT tracked on every board:
// - accessPermits: missing on IE entirely (only a read-only mirror exists)
// - installer: only exists as a real status column on UK and DE; IE/NL/FI
//   have no native "who's doing this install" field, so Resource Allocated
//   can't be derived for those three countries yet.
export const COUNTRY_BOARDS = [
  {
    id: '5678172488',
    country: 'UK',
    columns: {
      installDate: 'date',
      type: 'label4',
      kickOff: 'status__1',
      accessPermits: 'access_permits',
      hardwareStatus: 'color2',
      installer: 'dup__of_type__1',
      siteStatus: 'status9',
      resourceRequested: 'color_mm7eh5sy',
      bandwidth: 'text_mm7er48z',
      linkToSignUp: 'board_relation1__1'
    }
  },
  {
    id: '7519472262',
    country: 'IE',
    columns: {
      installDate: 'date1__1',
      type: 'status1__1',
      kickOff: 'status5__1',
      accessPermits: null,
      hardwareStatus: 'status81__1',
      installer: null,
      siteStatus: 'status9__1',
      resourceRequested: 'color_mm7e2q4t',
      bandwidth: 'text_mm7er93n',
      linkToSignUp: 'board_relation_mkmq1n7'
    }
  },
  {
    id: '5757397415',
    country: 'NL',
    columns: {
      installDate: 'date',
      type: 'dup__of_site_status__1',
      kickOff: 'status10__1',
      accessPermits: 'access_permits',
      hardwareStatus: 'color2',
      installer: null,
      siteStatus: 'status1__1',
      resourceRequested: 'color_mm7emrab',
      bandwidth: 'text_mm7ezcw7',
      linkToSignUp: 'board_relation6__1'
    }
  },
  {
    id: '5757508504',
    country: 'DE',
    columns: {
      installDate: 'date3',
      type: 'label1',
      kickOff: 'status9__1',
      accessPermits: 'access_permits',
      hardwareStatus: 'color2',
      installer: 'status30__1',
      siteStatus: 'status__1',
      resourceRequested: 'color_mm7ewq9y',
      bandwidth: 'text_mm7ebeyq',
      linkToSignUp: 'board_relation1__1'
    }
  },
  {
    id: '5756651462',
    country: 'FI',
    columns: {
      installDate: 'date',
      type: 'status1__1',
      kickOff: 'status8__1',
      accessPermits: 'access_permits',
      hardwareStatus: 'color2',
      installer: null,
      siteStatus: 'status__1',
      resourceRequested: 'color_mm7e224p',
      bandwidth: 'text_mm7et2mf',
      linkToSignUp: 'board_relation5__1'
    }
  }
];

// The 3 franchisee-facing readiness forms \u2014 one per country, no board for
// IE or FI yet. Each is a separate Monday Forms board in a different
// language, but all 3 were built from the same template, so every one
// uses the identical column IDs below \u2014 only the on-screen label text
// (and the Yes/No wording: Yes/Ja/Jaa vs No/Nein/Nee) differs.
export const READINESS_BOARDS = [
  { id: '18379251681', country: 'UK' },
  { id: '18391075175', country: 'DE' },
  { id: '18396748434', country: 'NL' }
];

export const READINESS_COLUMNS = {
  storeId: 'short_textjluohkcj',
  date: 'dateil43at5z',
  contactName: 'short_text2q1abstd',
  teamPrepared: 'single_selectxvq1oc5',
  areaPrepared: 'single_selectfmp3ddo',
  powerData: 'single_selectyvczs4q',
  hasFreedomPayTerminals: 'single_selectdfcews6',
  finalConfirmation: 'long_textre3ommqp'
};

// Yes-like affirmative values across English/German/Dutch form
// submissions. Everything else (including the specific "will be ready"
// / "not required" variants) is treated as not-yet-confirmed rather than
// guessed at.
const AFFIRMATIVE_VALUES = new Set(['yes', 'ja', 'jaa']);
export function isAffirmative(value) {
  return AFFIRMATIVE_VALUES.has((value || '').trim().toLowerCase());
}

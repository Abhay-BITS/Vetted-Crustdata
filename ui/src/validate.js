const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function gstinCheckDigit(first14) {
  let total = 0
  for (let i = 0; i < 14; i++) {
    const v = ALNUM.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2)
    total += Math.floor(v / 36) + (v % 36)
  }
  return ALNUM[(36 - (total % 36)) % 36]
}

/** Returns an error message for a field value, or '' when it looks right (or is empty). */
export function check(field, raw, all = {}) {
  const v = (raw || '').trim()
  if (!v) return ''
  const U = v.toUpperCase()
  switch (field) {
    case 'website':
      return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(v) ? '' : 'Enter a website like company.com'
    case 'cin':
      return /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(U) ? '' : 'A CIN has 21 characters, like L61074MH1991PLC061074'
    case 'llpin':
      return /^[A-Z]{3}-[0-9]{4}$/.test(U) ? '' : 'An LLPIN looks like AAB-1234'
    case 'pan':
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(U)) return 'A PAN has 10 characters, like AAACB0446L'
      if (all.gstin && all.gstin.length === 15 && all.gstin.toUpperCase().slice(2, 12) !== U) return 'This PAN is not the one inside the GSTIN'
      return ''
    case 'gstin':
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(U)) return 'A GSTIN has 15 characters, like 27AAACB0446L1ZS'
      return gstinCheckDigit(U.slice(0, 14)) === U[14] ? '' : `The last character should be ${gstinCheckDigit(U.slice(0, 14))}: this GSTIN is mistyped or made up`
    case 'ifsc':
      return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(U) ? '' : 'An IFSC has 11 characters, like HDFC0000001'
    case 'bank_account':
      return /^[0-9]{9,18}$/.test(v) ? '' : 'Account numbers are 9 to 18 digits'
    case 'contact_email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter an email address'
    case 'pincode':
      return /^[1-9][0-9]{5}$/.test(v) ? '' : 'A PIN code has 6 digits'
    case 'udyam':
      return /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(U) ? '' : 'A Udyam number looks like UDYAM-MH-02-0012345'
    case 'claimed_since': {
      const y = Number(v)
      return Number.isInteger(y) && y >= 1850 && y <= new Date().getFullYear() ? '' : 'Enter a year, like 2012'
    }
    default:
      return ''
  }
}

/** Warnings are suspicious but usable values: the service checks them and records the finding with evidence. */
export function isWarning(msg) {
  return msg.startsWith('The last character should be') || msg.startsWith('This PAN is not the one inside')
}

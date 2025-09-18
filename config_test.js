#!/usr/bin/env node

// Test config loading
process.env.OURBIGBOOK_VPN_CHECK = 'spur.us';
process.env.OURBIGBOOK_VPN_CHECK_SPUR_US_API_KEY = 'test-spur-key';
process.env.OURBIGBOOK_VPN_CHECK_IPAPI_IS_API_KEY = 'test-ipapi-key';

const config = require('./web/front/config');

console.log('VPN Config Test:');
console.log('  vpnCheck:', config.vpnCheck);
console.log('  vpnCheckIpapiIsApiKey:', config.vpnCheckIpapiIsApiKey);
console.log('  vpnCheckSpurUsApiKey:', config.vpnCheckSpurUsApiKey);
console.log('  ipapiIsApiKey (legacy):', config.ipapiIsApiKey);

// Test backward compatibility
delete process.env.OURBIGBOOK_VPN_CHECK_IPAPI_IS_API_KEY;
process.env.OURBIGBOOK_IPAPI_IS_API_KEY = 'legacy-key';

// Re-require to get updated config
delete require.cache[require.resolve('./web/front/config')];
const config2 = require('./web/front/config');

console.log('\nBackward Compatibility Test:');
console.log('  vpnCheck:', config2.vpnCheck);
console.log('  vpnCheckIpapiIsApiKey:', config2.vpnCheckIpapiIsApiKey);
console.log('  ipapiIsApiKey (legacy):', config2.ipapiIsApiKey);
#!/usr/bin/env node

// Example script demonstrating VPN provider configuration
console.log('OurBigBook VPN Provider Configuration Examples\n');

// Example 1: Using ipapi.is (default)
console.log('Example 1: Using ipapi.is (default provider)');
console.log('Environment variables:');
console.log('  OURBIGBOOK_VPN_CHECK_IPAPI_IS_API_KEY=your_ipapi_key_here');
console.log('  # OURBIGBOOK_VPN_CHECK defaults to "ipapi.is" if not set\n');

// Example 2: Using spur.us
console.log('Example 2: Using spur.us as VPN provider');
console.log('Environment variables:');
console.log('  OURBIGBOOK_VPN_CHECK=spur.us');
console.log('  OURBIGBOOK_VPN_CHECK_SPUR_US_API_KEY=your_spur_api_key_here\n');

// Example 3: Backward compatibility
console.log('Example 3: Backward compatibility with old environment variable');
console.log('Environment variables:');
console.log('  OURBIGBOOK_IPAPI_IS_API_KEY=your_ipapi_key_here');
console.log('  # Will automatically use ipapi.is provider with legacy key\n');

// Example 4: Both providers configured
console.log('Example 4: Both providers configured (controlled by OURBIGBOOK_VPN_CHECK)');
console.log('Environment variables:');
console.log('  OURBIGBOOK_VPN_CHECK=spur.us  # or "ipapi.is"');
console.log('  OURBIGBOOK_VPN_CHECK_IPAPI_IS_API_KEY=your_ipapi_key_here');
console.log('  OURBIGBOOK_VPN_CHECK_SPUR_US_API_KEY=your_spur_api_key_here\n');

// Test current configuration
console.log('Current Configuration Test:');
console.log('=========================');

// Set test environment
process.env.OURBIGBOOK_VPN_CHECK = process.env.OURBIGBOOK_VPN_CHECK || 'ipapi.is';

try {
  const config = require('./web/front/config');
  console.log('Selected VPN Provider:', config.vpnCheck);
  console.log('ipapi.is API Key:', config.vpnCheckIpapiIsApiKey ? '✓ Configured' : '✗ Not set');
  console.log('spur.us API Key:', config.vpnCheckSpurUsApiKey ? '✓ Configured' : '✗ Not set');
  console.log('Legacy ipapi.is Key:', config.ipapiIsApiKey ? '✓ Configured' : '✗ Not set');
} catch (e) {
  console.error('Error loading config:', e.message);
}

console.log('\nProvider Selection Logic:');
console.log('- If OURBIGBOOK_VPN_CHECK=ipapi.is, uses ipapi.is API');
console.log('- If OURBIGBOOK_VPN_CHECK=spur.us, uses spur.us API');
console.log('- If no API key is provided for selected provider, VPN check is skipped');
console.log('- Graceful fallback: errors in VPN API calls don\'t block user registration');
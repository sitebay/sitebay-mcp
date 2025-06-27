#!/bin/bash

# Test script for SiteBay MCP Server
echo "🧪 Testing SiteBay MCP Server..."

# Set the API token
export SITEBAY_API_TOKEN="SGzOwbiobD3pf06eeywRRPuGGn_pgDClJMh444DGnig"

echo "✅ API Token set"

# Test 1: Basic server startup
echo "🔄 Test 1: Server startup and tool listing..."
timeout 10s python -c "
import asyncio
from sitebay_mcp.server import mcp, initialize_client

async def test_startup():
    try:
        client = await initialize_client()
        print('✅ Client initialized successfully')
        
        # Test a simple API call
        regions = await client.list_regions()
        print(f'✅ API connection working - found {len(regions)} regions')
        
        await client.close()
        return True
    except Exception as e:
        print(f'❌ Error: {e}')
        return False

result = asyncio.run(test_startup())
print('✅ Basic connectivity test passed' if result else '❌ Basic connectivity test failed')
"

echo ""
echo "🔄 Test 2: Testing individual tools..."

# Test the regions tool (should work without auth issues)
timeout 10s python -c "
import asyncio
from sitebay_mcp.server import sitebay_list_regions, initialize_client

async def test_regions():
    try:
        result = await sitebay_list_regions()
        print('✅ Regions tool test passed')
        print(f'Result preview: {result[:200]}...')
        return True
    except Exception as e:
        print(f'❌ Regions tool failed: {e}')
        return False

asyncio.run(test_regions())
"

echo ""
echo "🔄 Test 3: Testing site listing..."

timeout 10s python -c "
import asyncio
from sitebay_mcp.server import sitebay_list_sites

async def test_sites():
    try:
        result = await sitebay_list_sites()
        print('✅ Sites listing test passed')
        print(f'Result preview: {result[:200]}...')
        return True
    except Exception as e:
        print(f'❌ Sites listing failed: {e}')
        return False

asyncio.run(test_sites())
"

echo ""
echo "🎉 Testing complete! Check results above."
echo ""
echo "💡 To test with Claude Desktop:"
echo "   1. Add the server to your claude_desktop_config.json"
echo "   2. Restart Claude Desktop" 
echo "   3. Try: 'List my WordPress sites on SiteBay'"
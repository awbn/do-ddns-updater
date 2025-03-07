jest.mock('dots-wrapper');
const { createApiClient } = require('dots-wrapper');
const { main } = require('./index');

// Mock out Digital Ocean firewall API
const listFirewalls = jest.fn(() => {
  return {
    data: {
      firewalls: [
        {
          id: '11111111-2222-3333-4444-555555555555',
          name: 'test',
          inbound_rules:[
            {
              protocol: 'tcp',
              ports: '22',
              sources: { addresses: [ '10.10.10.10']}
            }
          ],
          outbound_rules:[
            {
              protocol: 'tcp',
              ports: '0',
              destinations: { addresses: [ '0.0.0.0/0', '::/0' ] }
            }
          ],
          droplet_ids: []
        }
      ]
    }
}});
const updateFirewall = jest.fn((args) => {
  return {
    firewall: args
  };
});
createApiClient.mockImplementation(() => {
  return {
    firewall: {
      listFirewalls: listFirewalls,
      updateFirewall: updateFirewall
    }
  }
});

// https://docs.digitalocean.com/products/functions/reference/parameters-responses/#event-parameter
const event = {
  http: {
    headers: {
      "x-forwarded-for": "1.1.1.1",
      "host": "https://a.doserverless.co"
    },
    "path": "/api/v1/web/fn-1-2-3-4/unifi-ddns-do/fw",
    "method": "GET"
  }
};
const auth = "bearer " + btoa("example:super_secret_key");

// Tests

describe("Parameters", () => {
  test("Called without headers", async () => {
    let response = await main({ });
    expect(response.statusCode).toEqual(500);
  });
 
  test("Missing auth header", async () => {
    let response = await main(event);
    expect(response.statusCode).toEqual(401);
    expect(response.body).toContain("API token missing");
  });

  test("Invalid auth header (not base64 encoded)", async () => {
    let auth = "bearer 12345";
    const doEvent = { ...event };
    doEvent.http.headers['authorization'] = auth;

    let response = await main(doEvent);
    expect(response.statusCode).toEqual(401);
  });

  test("Invalid auth header (missing username)", async () => {
    let auth = "bearer " + btoa("super_secret_key");
    const doEvent = { ...event };
    doEvent.http.headers['authorization'] = auth;
    
    let response = await main(doEvent);
    expect(response.statusCode).toEqual(401);
    expect(response.body).toContain("Invalid API key or token");
  });

  test("Missing ip parameter", async () => {
    const doEvent = { ...event };
    doEvent.http.headers['authorization'] = auth;
    
    let response = await main(doEvent);
    expect(response.statusCode).toEqual(422);
    expect(response.body).toContain('The "ip" parameter is required and cannot be empty.');
  });

  test("Invalid ip parameter", async () => {
    const doEvent = { ...event };
    doEvent.http.headers['authorization'] = auth;
    doEvent["ip"] = "500.168.0.1";
    
    let response = await main(doEvent);
    expect(response.statusCode).toEqual(422);
    expect(response.body).toContain('The "ip" parameter does not appear to be a valid address.');
  });

  test("Invalid ip parameter (DDClient compat)", async () => {
    const doEvent = { ...event };
    doEvent.http.headers['authorization'] = auth;
    doEvent["myip"] = "500.168.0.1";

    let response = await main(doEvent);
    expect(response.statusCode).toEqual(422);
    expect(response.body).toContain('The "ip" parameter does not appear to be a valid address.');
  });

  test("Missing hostname parameter", async () => {
    const doEvent = { ...event };
    doEvent.http.headers['authorization'] = auth;
    doEvent["ip"] = "1.2.3.4";

    let response = await main(doEvent);
    expect(response.statusCode).toEqual(422);
    expect(response.body).toContain('The "hostname" parameter is required and cannot be empty.');
  });
});

describe("API Calls", () => {
  const doEvent = { ...event };
  const ip = "1.2.3.4";
  doEvent["ip"] = ip;
  
  test("Lookup name-based firewall (fail)", async () => {
    doEvent["hostname"] = "my-test-firewall-rule";
   
    let response = await main(doEvent);
    expect(response.statusCode).toEqual(400);
    expect(response.body).toContain("Could not find a firewall matching the requested name");
  });

  test("Lookup id-based firewall (fail)", async () => {
    doEvent["hostname"] = "a1111111-2222-3333-4444-555555555555";

    let response = await main(doEvent);
    expect(response.statusCode).toEqual(400);
    expect(response.body).toContain("Could not find a firewall matching the requested id");
  });

  test("Update Firewall record by name", async () => {
    doEvent["hostname"] = "test";
    
    let response = await main(doEvent);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toContain("ok");
  });

  test("Update Firewall record by id", async () => {
    doEvent["hostname"] = "11111111-2222-3333-4444-555555555555";
    
    jest.clearAllMocks(); // Reset mock calls
    const logSpy = jest.spyOn(console, 'log');

    let response = await main(doEvent);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toContain("ok");

    // Did it run through to completion?
    expect(updateFirewall).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenLastCalledWith('Update successful (test)');

    // Were the rules updated as expected?
    expect(updateFirewall.mock.calls[0][0]).toHaveProperty('inbound_rules[0].sources.addresses',[ip]);
    expect(updateFirewall.mock.calls[0][0]).toHaveProperty('outbound_rules[0].destinations.addresses',[ip]);
  });

  test("Failured in upstream response", async () => {
    // Unmock, but override endpoint so we can test error handling without abusing the API
    const unmocked = jest.requireActual('dots-wrapper');
    createApiClient.mockImplementation((args) => {
      return unmocked.createApiClient({token: args.token, endpoint:'https://example.com'});
    });
    const logSpy = jest.spyOn(console, 'log');

    let response = await main(doEvent);
    expect(response.statusCode).toEqual(404);
    expect(logSpy).toHaveBeenLastCalledWith('Upstream error: ' + response.body);

  });
});
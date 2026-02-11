const {createApiClient} = require('dots-wrapper');
const net = require('node:net');
//const {util} = require('util');

class HttpError extends Error {
	constructor(
		statusCode,
		message,
	) {
		super(message);
		this.name = 'HttpError';
    this.statusCode = statusCode;
	}
}

function parseAuth(event){
	const authorization = event.http.headers['authorization']
	if (!authorization) {
		throw new HttpError(401, 'API token missing.');
	}

	const [, data] = authorization.split(' ');
	//const decoded = atob(data); // Not available in Digital Ocean
  const decoded = Buffer.from(data, 'base64').toString()
	const index = decoded.indexOf(':');

	if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
		throw new HttpError(401, 'Invalid API key or token.');
	}

	return {
		apiEmail: decoded.substring(0, index),
		apiToken: decoded.substring(index + 1)
	};
}

function parseFirewall(event){
  const ip = event['ip'] || event['myip'];
	const hostname = event['hostname'];

	if (ip === null || ip === undefined) {
		throw new HttpError(422, 'The "ip" parameter is required and cannot be empty.');
	}

  if (net.isIP(ip) === 0) {
    throw new HttpError(422, 'The "ip" parameter does not appear to be a valid address.');
  }
  
  // We're abusing hostname as the firewall id/name
	if (hostname === null || hostname === undefined) {
		throw new HttpError(422, 'The "hostname" parameter is required and cannot be empty.');
	}

	return {
		ip: ip,
		firewall: hostname
	};
}

async function update(data, api) {
  // To do: actually handle pagination...
  const {data:{firewalls}} = await api.firewall.listFirewalls({per_page: 1000}); 

  let key = 'id';
  // Look up by name?
  if (! /^[{]?[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}[}]?$/.test(data.firewall)) {
    console.log(data.firewall + ' does not appear to be an id. Attempting to look up by name...');
    key = 'name';
  } 
  const record = firewalls.find(obj => obj[key] === data.firewall);

  if (record === null || record === undefined) {
    throw new HttpError(400, "Could not find a firewall matching the requested " + key + ". You must first manually create the firewall.");
  }

  console.log("Updating firewall record '" + record.name +"' to ip: " + data.ip);

  const input = {
    id: record.id,
    name: record.name,
    inbound_rules: record.inbound_rules.map(e => ({...e, sources: {addresses:[data.ip]}}) ),
    outbound_rules: record.outbound_rules.map(e => ({...e, destinations: {addresses:[data.ip]}}) ),
    droplet_ids: record.droplet_ids,
    tags: record.tags
  };

  const {result} = await api.firewall.updateFirewall(input);
  console.log('Update successful (' + record.name + ')');
  return result;
}

async function main(event) {
  try {      
    if (event['http'] === null || event['http'] === undefined) {
      throw new Error('Was not called as a web request');
    }
    
    // Log request
    console.log('Requestor IP: ' + event.http.headers['x-forwarded-for']);
    console.log(event.http['method'] + ': ' + event.http.headers['host'] + event.http['path']);
    //console.log('Request: ' + util.inspect(event, false, null, false)); // Can expose auth header, don't run in prod

    // Create client
    const auth = parseAuth(event);
    const api = await createApiClient({token: auth.apiToken});

    // Parse update data
    const data = parseFirewall(event);

    // Update record
    await update(data, api);
  
    // No error, return success
    return {
      body: "ok",
      statusCode: 200
    };

  } catch (error) {
    if (error instanceof HttpError) {
      console.log('Error updating record: ' + error.message);
      return {
        body: error.message,
        statusCode: error.statusCode
      };
    }else if (error.constructor.name == 'AxiosError') {
      console.log('Upstream error: '+ error.message);
      return {
        body: error.message,
        statusCode: error.response?.status || 503
      };
    } else {
      console.log('Error updating record: ' + error.message);
      return {
        body: 'Internal Server Error: ' + error.message,
        statusCode: 500
      };
    }
  }
}

exports.main = main;
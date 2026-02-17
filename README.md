> [!IMPORTANT]
> This has been replaced by https://github.com/awbn/cloudfw-ddns

# DDNS Updater for Digital Ocean Cloud Firewalls

A Digital Ocean serverless function that can update Digital Ocean cloud firewall rules leveraging a DDNS updater.

Heavily inspired by [Willswire's unifi-ddns](https://github.com/willswire/unifi-ddns) and [Using Dynamic DNS with Digital Ocean Firewalls](https://splateric.medium.com/using-dynamic-dns-with-digital-ocean-firewalls-d7cbd405a047)

## Why Use This?

Update the allowed IP address on a Cloud Firewall rule for inbound/outbound traffic. Useful, for, say, only allowing traffic from your home IP address through a cloud firewall. If you point a compatible DDNS client at it the Cloud Firewall rule will be kept up-to-date with a dynamic IP.

## How it works

This proxy script is hosted in a Digital Ocean serverless function and exposes an INADYN and ddclient compatible endpoint. When called, it transforms the DDNS update request into a Digital Ocean API call to update the provided firewall rule.

No credentials or rules are stored in the proxy itself; instead, you provide those as part of the DDNS update call.

## Setup

### Hosting the function

One-time:
- Install [doctl](https://docs.digitalocean.com/reference/doctl/how-to/install/) and authenticate
- Enable serverless functions support: `doctl serverless install`
- Create a serverless namespace and connect to a namespace: `doctl serverless connect`

Build & deploy:
- From the root of this repo, run `doctl serverless deploy . --remote-build`
- Get the function url: `doctl serverless fn get do-ddns-updater/fw --url`

### Configuring the firewall record

- Create a firewall for JUST DDNS purposes. Note: it must exist before the function is triggered. You can add as many inbound/outbound rules as you wish, but be aware that ALL IPs in the rules will be replaced by the DDNS IP
- Record the firewall name OR id (id is the GUID in the URL)
- Apply the firewall to droplets. Note that firewalls are additive; you can have two firewalls that allow inbound traffic on port 80, for instance, and when applied to the droplet it will allow traffic from the inbound IPs in both firewalls

### Setting up the client

Get a [Digital Ocean access token](https://docs.digitalocean.com/reference/api/create-personal-access-token/) with at least `firewall read` and `firewall update` scopes. Note: if you create a token with an expiration date (recommended), make sure you update your DDNS client with a new token before it expires!

On a compatible client set the following DDNS parameters (example for a Unifi gateway):
- Service: `custom` or `dyndns`
- Hostname: `<the firewall name or id (GUID)>`
- Username: `<anything, this isn't used but can't be blank>`
- Password: `<Digial Ocean access token>`
- Server: The function url, without `https://` and with `?ip=%i&hostname=%h` appended at the end. E.g., `faas-sfo3-12345.doserverless.co/api/v1/web/fn-11111111-2222-3333-4444-555555555555/do-ddns-updater/fw?ip=%i&hostname=%h`

## Known limitations
- Will update all inbound/outbound ip addresses in the given rule
- Unknown IPv6 support

## Troubleshooting
To test:
- Encode the bearer token: in Node: `console.log(btoa("test:TOKEN"))`
- `curl -X GET "https://faas-sfo3-12345.doserverless.co/api/v1/web/fn-11111111-2222-3333-4444-555555555555/do-ddns-updater/fw?ip=1.2.3.4&hostname=home-inbound-allow" \
  -H "authorization: bearer ENCODED_TOKEN"`

## Contributing
Open a PR!

To test: From `./packages/do-ddns-updater/fw`, run `npm run test`

# Bitespeed Identity Reconciliation API

This is a backend service for identity reconciliation implemented as a web service with a single `/identify` endpoint.

## API Endpoint

The consolidated contact information can be retrieved by sending a `POST` request to the following endpoint:

`https://identity-reconciliation-djby.onrender.com/identify`

### Example Request

```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}

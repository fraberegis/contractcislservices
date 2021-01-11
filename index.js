const Express = require('express')
const Config = require('config');
const Axios = require("axios");

const app = Express()

const STADIUM_CONTRACT = 'CONTRACT'

const envs = ['uat', 'mntn', 'prod'];
if ("ABS_ENV" in process.env && envs.indexOf(process.env.ABS_ENV.toLowerCase()) != -1) {
    env = process.env.ABS_ENV.toLowerCase()
} else {
    env = 'uat'
}
const apigeeServer = Config.get('apigee.server.' + env)
const tokenURI = apigeeServer + Config.get('apigee.oAuth.resource')

const bodyData = new URLSearchParams()
bodyData.append('grant_type', Config.get('apigee.oAuth.grantType'))
bodyData.append('client_id', Config.get('apigee.oAuth.' + (isProd() ? 'prod' : 'non-prod') + '.clientId'))
bodyData.append('client_secret', Config.get('apigee.oAuth.' + (isProd() ? 'prod' : 'non-prod') + '.clientSecret'))

/**
 * Validate JSON 
 */
function isProd (){
    return env == 'prod'
}

/** 
 * Interceptors for Axios  req/res
 * uncomment to activate
 */
/*Axios.interceptors.request.use(x => {
    const headers = {
        ...x.headers.common,
        ...x.headers[x.method],
        ...x.headers
    };
    ['common','get', 'post', 'head', 'put', 'patch', 'delete'].forEach(header => {
        delete headers[header]
    })
    const printable = `${new Date()} | Request: ${x.method.toUpperCase()} | ${x.url} | ${ JSON.stringify( x.data) } | ${ JSON.stringify(headers)}`
    console.log(printable)

    return x;
})
Axios.interceptors.response.use(x => {
    const printable = `${new Date()} | Response: ${x.status} | ${ JSON.stringify(x.data) }`
    console.log(printable)

    return x;
})
*/

/**
 * Validate JSON 
 */
function isJSONValid (jsonString){
    try {
        var o = JSON.parse(jsonString);

        // Handle non-exception-throwing cases:
        // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
        // but... JSON.parse(null) returns null, and typeof null === "object", 
        // so we must check for that, too. Thankfully, null is falsey, so this suffices:
        if (o && typeof o === "object") {
            return o;
        }
    }
    catch (e) { }

    return false;
};

/**
 * Filter array items based on search criteria (query)
 */
function filterContract(arr, stadium) {
    return arr.filter(function(el) {
        return el.stadium.localeCompare(stadium) == 0
    })
}

/** 
 * Get all contracts by externalContractNumber and/or by lastName 
 * (plus eventually firstName to narrow searching)
 */
app.get('/policies', (req,res) => {
    // Validate parameters: externalPolicyNumber or lastName is mandatory
    if ((req.query.externalPolicyNumber == null || req.query.externalPolicyNumber.length == 0) &&
        (req.query.lastName == null || req.query.lastName.length == 0)){
        let errorMsg = {
            'error': 'Invalid parameters.',
            'detail': {
                'accepted': 'externalPolicyNumber, firstName, lastName',
                'expected': 'externalPolicyNumber or lastName'
            }
        }
        return res.status(400).json(errorMsg)
    }
    let params = new URLSearchParams();
    if (req.query.externalPolicyNumber != null && req.query.externalPolicyNumber.length > 0){
        params.append('externalPolicyNumber', req.query.externalPolicyNumber)    
    }
    if (req.query.lastName != null && req.query.lastName.length > 0){
        params.append('lastName', req.query.lastName)    
    }
    if (req.query.firstName != null && req.query.firstName.length > 0){
        params.append('firstName', req.query.firstName)    
    }
    // Get access token
    Axios({
        method: 'post', 
        url: tokenURI, 
        timeout: Config.get('timeout.short'),
        data: bodyData})
    .then((response) => {
//        console.log('Token got: '+response.status)
        const headers = {
            'Accept': 'application/json',
            'subscriptionCountry': 'EUR',
            'Authorization': 'Bearer ' + response.data.access_token
        }
//        console.log(headers)
//        console.log(params)
        let policySearchURI = apigeeServer + Config.get('policy.url.search')
        Axios({
            method: 'get', 
            url: policySearchURI, 
            timeout: Config.get('timeout.long'),
            headers: headers, 
            params: params
        })
        .then((response) => {
//            console.log('Policies got')
//            console.log(response.data)
            /* Filter out contract not in CONTRACT stadium*/

            res.status(200).json(filterContract(response.data, STADIUM_CONTRACT))
        })    
        .catch((error) => {
//            console.log('Error while Policy Search: '+error.response.status)
            return res.status(error.response.status).json(error.response.data)
        })    
    })
    .catch((error) => {
        return res.status(error.response.status).json(error.response.data)
    })
})

/**
 * Get Policy details 
 */
app.get('/policies/:id', (req,res) => {
    // Get access token
    Axios({
        method: 'post', 
        url: tokenURI, 
        timeout: Config.get('timeout.short'),
        data: bodyData})
    .then((response) => {
//        console.log('Token got: '+response.status)
        const headers = {
            'Accept': 'application/json',
            'subscriptionCountry': 'EUR',
            'Authorization': 'Bearer ' + response.data.access_token
        }
//        console.log(headers)
//        console.log(params)
        let policyDetailsURI = apigeeServer + Config.get('policy.url.details')
        Axios({
            method: 'get', 
            url: String(policyDetailsURI).replace(':id', req.params.id), 
            timeout: Config.get('timeout.long'),
            headers: headers
        })
        .then((response) => {
//            console.log('Policy data got')
//            console.log(response.data)
            /* Return only the policy node */
            res.status(200).json(response.data.policy)
        })    
        .catch((error) => {
//            console.log('Error while getting Policy Details: '+error.response.status)
            return res.status(error.response.status).json(error.response.data)
        })    
    })
    .catch((error) => {
        return res.status(error.response.status).json(error.response.data)
    })
})

/**
 * Get Policy documents list 
 */
app.get('/policies/:id/documents', (req,res) => {
    const searchIdRegEx = new RegExp(':id', 'g')
    const searchDocIdRegEx = new RegExp(':documentId', 'g')
    // Get access token
    Axios({
        method: 'post', 
        url: tokenURI,
        timeout: Config.get('timeout.short'),
        data: bodyData})
    .then((response) => {
//        console.log('Token got: '+response.status)
        const headers = {
            'Accept': 'application/json',
            'subscriptionCountry': 'EUR',
            'Authorization': 'Bearer ' + response.data.access_token
        }
//        console.log(headers)
//        console.log(params)
        let policyDocumentsURI = apigeeServer + Config.get('policy.url.documents')
        Axios({
            method: 'get', 
            url: String(policyDocumentsURI).replace(searchIdRegEx, req.params.id), 
            timeout: Config.get('timeout.short'),
            headers: headers
        })
        .then((response) => {
//            console.log('Policy documents got')
//            console.log(response.data)
            const documentsList = response.data
            if (documentsList.length > 0){
                const docRequests = new Array()
                documentsList.forEach(document => {
//                    console.log(document.documentId)
                    let docDataURI = String(apigeeServer + Config.get('policy.url.document'))
                                        .replace(searchIdRegEx, req.params.id)
                                        .replace(searchDocIdRegEx, document.documentId)
                    docRequests.push(
                        Axios.get(docDataURI,{timeout: Config.get('timeout.short'),headers: headers})
                        .then(function (response) {
//                            console.log(response.data.fileName)
                            return response.data
                        })
                        .catch(error => { return error 
                        })
                    )
                });
//                console.log(docRequests.length)
                Promise.all(docRequests)
                .then(responses => { 
//                    console.log(responses.length)
                    let finalDocs = new Array()
                    responses.forEach(oneResponse => {
//                        console.log(oneResponse)
                        if (oneResponse.documentStorageType != 'L' && 
                            typeof oneResponse.data != "undefined" && oneResponse.data != null){
                                finalDocs.push(oneResponse)
                            }
                    });
                    res.status(200).json(finalDocs)
                })
            } else {
                res.status(200).json(documentsList)
            }
        })    
        .catch((error) => {
//            console.log('Error while getting Policy documents: '+error.response.status)
            return res.status(error.response.status).json(error.response.data)
        })    
    })
    .catch((error) => {
        return res.status(error.response.status).json(error.response.data)
    })
})

app.listen(Config.get('server.port'), () => {
    console.log('Server listening on ' + Config.get('server.port'))
    console.log('Env: ' + env)
})
// Load, save, and clear parameters in local storage.
//
// Parameters is an array of hashes.  Each hash has
// * name - The name of the parameter for the application
// * query - The query parameter name, optional
// * default - What to return if the value is not found in local storage
//
// The type of the default is used to parse and format values stored
// in local stroage.  Supported types are numeric, boolean, and string.
//
// All functions take a storageKey which is used as a prefix when accessing
// storage.
var paramLib = (function() {
    // Adapted from
    // https://paulund.co.uk/how-to-capitalize-the-first-letter-of-a-string-in-javascript
    var ucFirst = function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    };
    
    return {
        // Iterate over parameters, checking first the query string
        // then local stroage for a value.  Return the deafult if it
        // is not found in either.
        //
        // storageKey - the prefix for the parameter key
        // parameters - array of parameters to load
        // value - array to load values into
        // query - optional hash containing values from the query string
        //
        // For each parameter, p, we set values[p.name] to query[p.query],
        // localStorage[storageKey+'.'+p.name], or p.default
        loadParameters : function(storageKey, parameters, values, query = {}) {
            var found = false;
            for (var i = 0; i < parameters.length; ++i) {
                var p = parameters[i];
                var s;

                // Get a string from query parameters or local storage
                if (query.hasOwnProperty(p.query)) {
                    s = query[p.query];
                }
                else {
                    var key = storageKey + "." + ucFirst(p.name);
                    s = localStorage.getItem(key);
                    if (s != null) {
                        found = true;
                    }
                }
                
                // If there's no value, use the default
                if (s == null) {
                    values[p.name] = p.default;
                }
                // If we found a value, convert it as needed
                else {
                    // Convert boolean parameters
                    if (typeof(p.default) == 'boolean') {
                        if (typeof(s) == 'boolean') {
                            values[p.name] = s;
                        }
                        else {
                            // FIXME - consider JSON.parse(s)
                            values[p.name] = s == 'true';
                        }
                    }
                    // Convert numeric parameters
                    else if (typeof(p.default) == 'number') {
                        values[p.name] = parseInt(s);
                    }
                    // Everything else is a string
                    else {
                        values[p.name] = s;
                    }
                }
            }
            return found;
        },
        
        // Iterate over parameters, saving the corresponding values to
        // local storage.
        //
        // storageKey - the prefix for the parameter key
        // parameters - array of parameters to save
        // value - array of values to save
        //
        // For each parameter, p, we save values[p.name] to
        // localStorage[storageKey+'.'+p.name]
        saveParameters : function(storageKey, parameters, values, query = {}) {
            for (var i = 0; i < parameters.length; ++i) {
                var p = parameters[i];
                var key = storageKey + "." + ucFirst(p.name);
                if (typeof(p.default) == 'boolean') {
                    localStorage.setItem(key,
                                         values[p.name] ? 'true' : 'false');
                }
                else {
                    localStorage.setItem(key, values[p.name]);
                }
                if (p.hasOwnProperty('query')) {
                    query[p.query] = values[p.name];
                }
            }
        },
        
        // Iterate over parameters, clearing the corresponding values
        // from local storage.
        //
        // storageKey - the prefix for the parameter key
        // parameters - array of parameters to clear.  If missing, clear
        //    all items starting with storageKey followed by '.'
        //
        // For each parameter, p, we remove localStorage[storageKey+'.'+p.name]
        clearParameters : function(storageKey, parameters = null) {
            if (parameters == null) {
                var s = storageKey + '.';
                var l = s.length;
                Object.keys(localStorage).forEach(key => {
                    if (key.substring(0,l) == s) {
                        localStorage.removeItem(key);
                    }
                });
            }
            else {
                for (var i = 0; i < parameters.length; ++i) {
                    var p = parameters[i];
                    localStorage.removeItem(storageKey + "." + ucFirst(p.name));
                }
            }
        }
    };
})();

var paramLib = (function() {
    // Adapted from
    // https://paulund.co.uk/how-to-capitalize-the-first-letter-of-a-string-in-javascript
    var ucFirst = function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    };
    
    return {
        loadParameters : function(storageKey, parameters, values) {
            var found = false;
            for (var i = 0; i < parameters.length; ++i) {
                var p = parameters[i];
                // Get a string from local storage
                var key = storageKey + "." + ucFirst(p.name);
                var s = localStorage.getItem(key);
                // If there's no value, use the default
                if (s == null) {
                    values[p.name] = p.default;
                }
                // If we found a value, convert it as needed
                else {
                    found = true;
                    // Convert boolean parameters
                    if (typeof(p.default) == 'boolean') {
                        values[p.name] = s == 'true';
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
        
        saveParameters : function(storageKey, parameters, values) {
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

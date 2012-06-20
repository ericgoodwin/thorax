/*
based on https://github.com/rickharrison/validate.js

data-error-message
data-validate-regex
data-validate-method (calls method)
data-validate-empty
data-validate-email
data-validate-matches
data-validate-length
data-validate-min-length
data-validate-max-length
data-validate-min
data-validate-max
data-validate-alpha
data-validate-alpha-numeric
data-validate-alpha-numeric-dash
data-validate-numeric
data-validate-integer
*/
(function(){
  var validationAttributeNamePrefix = 'data-validate-',
    errorMessageAttributeName = 'data-error-message',
    numericRegex = /^[0-9]+$/,
    integerRegex = /^\-?[0-9]+$/,
    decimalRegex = /^\-?[0-9]*\.?[0-9]+$/,
    emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,6}$/i,
    alphaRegex = /^[a-z]+$/i,
    alphaNumericRegex = /^[a-z0-9]+$/i,
    alphaNumericDashRegex = /^[a-z0-9_-]+$/i;

  Thorax.Validations = {
    regex: function(pattern, value) {
      var regex = new RegExp(pattern);
      return Boolean(regex.exec(value));
    },
    method: function(methodName, value) {
      return this[methodName].call(this, value);
    },
    required: function(shouldValidate, value) {
      return Boolean(shouldValidate) ? trim(value) !== '' : true;
    },
    email: function(shouldValidate, value) {
      return Boolean(shouldValidate) ? Boolean(value.match(emailRegex)) : true;
    },
    matches: function(matchingFieldName, value) {
      var matchingValue = this.$('input[name="' + matchingFieldName + '"]').val();
      return matchingValue === value;
    },
    length: function(length, value) {
      return value.length === length;
    },
    'min-length': function(minLength, value) {
      return value.length >= minLength;
    },
    'max-length': function(maxLength, value) {
      return value.length <= maxLength;
    },
    min: function(minValue, value) {
      return parseInt(value, 10) >= minValue;
    },
    max: function(maxValue, value) {
      return parseInt(value, 10) <= maxValue;
    },
    alpha: function(shouldValidate, value) {
      return Boolean(shouldValidate) ? Boolean(value.match(alphaRegex)) : true;
    },
    'alpha-numeric': function(shouldValidate, value) {
      return Boolean(shouldValidate) ? Boolean(value.match(alphaNumericRegex)) : true;
    },
    'alpha-numeric-dash': function(shouldValidate, value) {
      return Boolean(shouldValidate) ? Boolean(value.match(alphaNumericDashRegex)) : true;
    },
    numeric: function(shouldValidate, value) {
      return Boolean(shouldValidate) ? Boolean(value.match(numericRegex)) : true;
    },
    integer: function(shouldValidate, value) {
      return Boolean(shouldValidate) ? Boolean(value.match(integerRegex)) : true;
    }
  };
  var Validations = Thorax.Validations;

  Validations.regex.message = 'Did not match the required pattern';
  Validations.method.message = 'Did not match the required pattern';
  Validations.required.message = 'Required';
  Validations.matches.message = 'Must match {{validation}}';
  Validations.email.message = 'Must contain a valid email address';
  Validations['min-length'].message = 'Must be at least {{validation}} characters in length';
  Validations['max-length'].message = 'Must not exceed {{validation}} characters in length';
  Validations.length = 'Must be exactly {{validation}} characters in length';
  Validations.min.message = 'Must contain a number greater than {{validation}}';
  Validations.max.message = 'Must contain a number less than {{validation}}';
  Validations.alpha.message = 'Must only contain alphabetical characters';
  Validations['alpha-numeric'].message = 'Must only contain alpha-numeric characters';
  Validations['alpha-numeric-dash'].message = 'Must only contain alpha-numeric characters, underscores, and dashes';
  Validations.numeric.message = 'Must contain only numbers';
  Validations.integer.message = 'Must contain an integer'

  var _getInputValue = Thorax.View.prototype._getInputValue;
  _.extend(Thorax.View.prototype, {
    _getInputValue: function(input, options, errors) {
      var $input = $(input);
      if (options && options.validate) {
        _.each(Validations, function(validation, attributeName) {
          var validationValue = $input.attr(validationAttributeNamePrefix + attributeName);
          if (validationValue) {
            var valid = Validations[attributeName].call(this, validationValue, input.value),
                message,
                label,
                id;
            if (typeof valid === 'string') {
              message = valid;
              valid = false;
            }
            if (!valid) {
              message = message || $input.attr(errorMessageAttributeName) || Validations[attributeName].message;
              label = labelNameFromInput.call(this, $input);
              id = $input.attr('id');
              errors.push({
                element: $input,
                name: $input.attr('name'),
                label: label,
                id: id,
                message: Thorax.View.expandToken(message, {
                  label: label,
                  id: id,
                  validation: validationValue,
                  value: input.value
                })
              });
            }
          }
        }, this);
      }
      return _getInputValue.call(this, input, options, errors);
    }
  });
  
  var trimRegex = /^s+|s+$/g;
  function trim(str) {
    return str.replace(trimRegex, '');
  }

  function labelNameFromInput($input) {
    var id = $input.attr('id');
    if (id) {
      var label = this.$('label[for="' + id + '"]');
      if (label) {
        return label.text();
      }
    }
    return $input.attr('name');
  }

  Thorax.View.expandToken = function(input, scope) {
    if (input && input.indexOf && input.indexOf('{{') >= 0) {
      var re = /(?:\{?[^{]+)|(?:\{\{([^}]+)\}\})/g,
          match,
          ret = [];
      function deref(token, scope) {
        var segments = token.split('.'),
            len = segments.length;
        for (var i = 0; scope && i < len; i++) {
          if (segments[i] !== 'this') {
            scope = scope[segments[i]];
          }
        }
        return scope;
      }
      while (match = re.exec(input)) {
        if (match[1]) {
          var params = match[1].split(/\s+/);
          if (params.length > 1) {
            var helper = params.shift();
            params = params.map(function(param) { return deref(param, scope); });
            if (Handlebars.helpers[helper]) {
              ret.push(Handlebars.helpers[helper].apply(scope, params));
            } else {
              // If the helper is not defined do nothing
              ret.push(match[0]);
            }
          } else {
            ret.push(deref(params[0], scope));
          }
        } else {
          ret.push(match[0]);
        }
      }
      input = ret.join('');
    }
    return input;
  };

})();

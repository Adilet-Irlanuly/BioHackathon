(function(exports) {
  var site;

  /** @type {!number} */
  var activeFilterIndex = 0;

  /** @type {{type: string, severity: number} | undefined} */
  var restoreSettings = undefined;

  /**
   * The strings for CVD Types.
   * TODO(mustaq): Define an enum in cvd.js instead.
   * @const {array{string}}
   */
  var CVD_TYPES = ['PROTANOMALY','DEUTERANOMALY','TRITANOMALY'];

  /**
   * Vertical offset for displaying the row highlight.
   * @const {number}
   */
  var HIGHLIGHT_OFFSET = 7;

  /**
   * Creates a radio button for selecting the given type of CVD and a series of
   * color swatches for testing color vision.
   * @param {string} cvdType   */
  
  function createTestRow(type) {
    var toCssColor = function(rgb) {
      return 'rgb(' + rgb.join(',') + ')';
    };
    var row = document.createElement('label');
    row.classList.add('row');

    var button = document.createElement('input');
    button.id = 'select-' + type;
    button.name = 'cvdType';
    button.setAttribute('type', 'radio');
    button.value = type;
    button.checked = false;
    row.appendChild(button);
    button.addEventListener('change', function() {
      onTypeChange(this.value);
    });
    button.setAttribute('aria-label', type);

    var buttonText = document.createTextNode(type.charAt(0).toUpperCase() + type.slice(1).toLowerCase());
    row.appendChild(buttonText);
   
    return row;
  }

  /**
   * Gets the CVD type selected through the radio buttons.
   * @return {?string}
   */
  function getCvdTypeSelection(){
    var active = undefined;
    CVD_TYPES.forEach(function(str){
      if($('select-' + str).checked){
        active = str;
        return;
      }
    });
    return active;
  }

  /**
   * Sets the radio buttons selection to the given CVD type.
   * @param {string} cvdType 
   * @return {?string}
   */
  function setCvdTypeSelection(cvdType) {
    var highlight = $('row-highlight');
    highlight.hidden = true;
    CVD_TYPES.forEach(function(str) {
      var checkbox = $('select-' + str);
      if (cvdType == str) {
        checkbox.checked = true;
        var top = checkbox.parentElement.offsetTop - HIGHLIGHT_OFFSET;
        highlight.style.top = top + 'px';
        highlight.hidden = false;
      } else {
        checkbox.checked = false;
      }
    });
  }

  /**
   * Styles controls based on stage of setup.
   */
  function updateControls() {
    if ($('flex-container').classList.contains('activated')) {
      // Not performing setup.  Ensure main controls are enabled.
      $('enable').disabled = false;
      $('delta').disabled = false;
      $('setup').disabled = false;
    } else {
      // Disable main controls during setup phase.
      $('enable').disabled = true;
      $('delta').disabled = true;
      $('setup').disabled = true;

      if (!getCvdTypeSelection()) {
        // Have not selected a CVD type. Mark Step 1 as active.
        $('firstStep').classList.add('active');
        $('secondStep').classList.remove('active');
        // Disable "step 2" controls.
        $('severity').disabled = true;
        $('reset').disabled = true;
      } else {
        $('firstStep').classList.remove('active');
        $('secondStep').classList.add('active');
        // Enable "step 2" controls.
        $('severity').disabled = false;
        $('reset').disabled = false;
        // Force filter update.
        onSeverityChange(parseFloat($('severity').value));
      }
    }
  }

  /**
   * Update the popup controls based on settings for this site or the default.
   * @return {boolean} True if settings are valid and update performed.
   */
  function update() {
    var type = getDefaultType();
    var validType = false;
    CVD_TYPES.forEach(function(cvdType) {
      if (cvdType == type) {
        validType = true;
        return;
      }
    });

    if (!validType)
      return false;

    if (site) {
      $('delta').value = getSiteDelta(site);
    } else {
      $('delta').value = getDefaultDelta();
    }

    $('severity').value = getDefaultSeverity();

    if (!$('flex-container').classList.contains('activated'))
      setCvdTypeSelection(getDefaultType());
    $('enable').checked = getDefaultEnable();

    debugPrint('update: ' +
        ' del=' + $('delta').value +
        ' sev=' + $('severity').value +
        ' typ=' + getDefaultType() +
        ' enb=' + $('enable').checked +
        ' for ' + site
    );
    chrome.extension.getBackgroundPage().updateTabs();
    return true;
  }

  /**
   * Callback for color rotation slider.
   *
   * @param {number} value Parsed value of slider element.
   */
  function onDeltaChange(value) {
    debugPrint('onDeltaChange: ' + value + ' for ' + site);
    if (site) {
      setSiteDelta(site, value);
    }
    setDefaultDelta(value);
    update();
  }

  /**
   * Callback for severity slider.
   *
   * @param {number} value Parsed value of slider element.
   */
  function onSeverityChange(value) {
    debugPrint('onSeverityChange: ' + value + ' for ' + site);
    setDefaultSeverity(value);
    update();
    // Apply filter to popup swatches.
    var filter = window.getDefaultCvdCorrectionFilter(
        getCvdTypeSelection(), value);
    injectColorEnhancementFilter(filter);
    // Force a refresh.
    window.getComputedStyle(document.documentElement, null);
  }

  /**
   * Callback for changing color deficiency type.
   *
   * @param {string} value Value of dropdown element.
   */
  function onTypeChange(value) {
    debugPrint('onTypeChange: ' + value + ' for ' + site);
    setDefaultType(value);
    update();
    // TODO(kevers): reset severity to effectively disable filter.
    activeFilterType = value;
    $('severity').value = 0;
    updateControls();
  }

  /**
   * Callback for enable/disable setting.
   *
   * @param {boolean} value Value of checkbox element.
  */
  function onEnableChange(value) {
    debugPrint('onEnableChange: ' + value + ' for ' + site);
    setDefaultEnable(value);
    if (!update()) {
      // Settings are not valid for a reconfiguration.
      $('setup').onclick();
    }
  }

  /**
   * Callback for resetting stored per-site values.
   */
  function onReset() {
    debugPrint('onReset');
    resetSiteDeltas();
    update();
  }

  /**
   * Attach event handlers to controls and update the filter config values for
   * the currently visible tab.
   */
  function initialize() {
    var i18nElements = document.querySelectorAll('*[i18n-content]');
    for (var i = 0; i < i18nElements.length; i++) {
      var elem = i18nElements[i];
      var msg = elem.getAttribute('i18n-content');
      elem.textContent = chrome.i18n.getMessage(msg);
    }

    $('setup').onclick = function() {
      $('flex-container').classList.remove('activated');
      // Store current settings in the event of a canceled setup.
      restoreSettings = {
        type: getDefaultType(),
        severity: getDefaultSeverity()
      };
      // Initalize controls based on current settings.
      setCvdTypeSelection(restoreSettings.type);
      $('severity').value = restoreSettings.severity;
      updateControls();
    };

    $('delta').addEventListener('input', function() {
      onDeltaChange(parseFloat(this.value));
    });
    $('severity').addEventListener('input', function() {
      onSeverityChange(parseFloat(this.value));
    });
    $('enable').addEventListener('change', function() {
      onEnableChange(this.checked);
    });

    $('reset').onclick = function() {
      setDefaultSeverity(0);
      setDefaultType('');
      setDefaultEnable(false);
      $('severity').value = 0;
      $('enable').checked = false;
      setCvdTypeSelection('');
      updateControls();
      clearColorEnhancementFilter();
    };
    $('reset').hidden = !IS_DEV_MODE;

    var closeSetup = function() {
      $('flex-container').classList.add('activated');
      updateControls();
    };

    $('ok').onclick = function() {
      closeSetup();
    };

    $('cancel').onclick = function() {
      closeSetup();
      if (restoreSettings) {
        debugPrint(
          'restore previous settings: ' +
          'type = ' + restoreSettings.type +
           ', severity = ' + restoreSettings.severity);
        setDefaultType(restoreSettings.type);
        setDefaultSeverity(restoreSettings.severity);
      }
    };

    var swatches = $('swatches');
    CVD_TYPES.forEach(function(cvdType) {
      swatches.appendChild(createTestRow(cvdType));
    });

    chrome.windows.getLastFocused({'populate': true}, function(window) {
      for (var i = 0; i < window.tabs.length; i++) {
        var tab = window.tabs[i];
        if (tab.active) {
          site = siteFromUrl(tab.url);
          debugPrint('init: active tab update for ' + site);
          update();
          return;
        }
      }
      site = 'unknown site';
      update();
    });
  }

  /**
   * Runs initialize once popup loading is complete.
   */
  exports.initializeOnLoad = function() {
    var ready = new Promise(function readyPromise(resolve) {
      if (document.readyState === 'complete') {
        resolve();
      }
      document.addEventListener('DOMContentLoaded', resolve);
    });
    ready.then(initialize);
  };
})(this);

this.initializeOnLoad();

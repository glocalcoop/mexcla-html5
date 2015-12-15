var cur_call = null;
var verto;

$(document).ready(function() {
    mexcla_init();
});

$("#mic-mute").click(function() {
  mexcla_mic_mute();
});

$("#mic-unmute").click(function() {
  mexcla_mic_unmute();
});

$("#mode-original").click(function() {
  mexcla_mode_original();
});

$("#mode-hear-interpretation").click(function() {
  mexcla_mode_hear_interpretation();
});

$("#mode-provide-interpretation").click(function() {
  mexcla_mode_provide_interpretation();
});

$("#connect-button").click(function() {
  mexcla_toggle_call_status();
});

function mexcla_toggle_call_status() {
  if(cur_call) {
    mexcla_hangup();
  } else {
    mexcla_call_init();
  }
}

function mexcla_hangup() {
  if(cur_call) {
    verto.hangup();
    // Unset cur_call so when the user tries to re-connect
    // we know to re-connect
    cur_call = null;
  }
  change_submit_button_value(lang_connect);
  // Seems to prevent reconnection without a page reload
  location.reload();
}

function mexcla_init() {
  conf = mexcla_get_conference_number();
  console.log("Conference is: " + conf);
  $('.pstn-instructions-conference-number').append(conf);
  mexcla_init_language_links();
  mexcla_login();
}

function mexcla_login() {
  verto = new $.verto({
      login: config.impi,
      passwd: config.password,
      socketUrl: config.websocket_proxy_url,
      tag: "audio-remote",
      videoParams: {},
      audioParams: {
        googAutoGainControl: false,
        googNoiseSuppression: false,
        googHighpassFilter: false
      },
      iceServers: true,
  });
}

function mexcla_init_language_links() {
  // Update the en and es page links to include the
  // given URL parameters.
  path = window.location.pathname;
  if(-1 != path.indexOf('/en/')) {
    en = path;
    es = path.replace('/en/','/es/');
  }
  else {
    es = path;
    en = path.replace('/es/','/en/');
  }
  document.getElementById('es-switch-link').href = es;
  document.getElementById('en-switch-link').href = en;
}


// Generate a random-looking hash that will be the same for everyone on the
// same conference call.
function mexcla_get_hash() {
  return 'mexcla-' + mexcla_get_conference_number();
}

function mexcla_call_init() {
  // Ensure we have a conference number
  conf = mexcla_get_conference_number();
  if(conf == 0) {
    alert("Failed to get the conference number.");
    return false;
  }
  if(conf > 999999999) {
    alert("Conference numbers must be equal to or below 999,999,999. Your number is " + conf);
    return false;
  }
   
  if(cur_call) {
    return;
  }

  cur_call = verto.newCall({
    destination_number: "9999",
    caller_id_name: "Mexcla",
    caller_id_number: "web",
    useVideo: false,
    useStereo: false
  },callbacks);

 // Initialize radio buttons
  mexcla_check_radio_button('mic-unmute');
  mexcla_check_radio_button('mode-original');
}

callbacks = {
  onDialogState: function(d) {
    cur_call = d;
    console.log(d.state);
    switch (d.state) {
      case $.verto.enum.state.requesting:
        change_submit_button_value(lang_connecting);
        break;
      case $.verto.enum.state.active:
        change_submit_button_value(lang_disconnect);
        mexcla_join_conference();
        break;
      case $.verto.enum.state.hangup:
        mexcla_hangup();
        break;
    }
  }
}
  
 
function mexcla_get_url_params() {
  // Split the url by /, skipping the first / so we don't have an empty value first.
  parts = window.location.pathname.substr(1).split('/');
  // Delete empty parts
  for (var i = 0; i < parts.length; i++) {
    if(parts[i] == '') {
      delete parts[i];
    }
  }
  return parts;
}

function mexcla_get_conference_number() {
  var params = mexcla_get_url_params();
  // Find the numeric argument. Pick the first one we find
  // and we use that as the conference number.
  // Thanks to http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
  conf = 0;
  for (var i = 0; i < params.length; i++) {
    param = params[i];
    if(!isNaN(parseFloat(param)) && isFinite(param)) {
      conf = param;
      break;
    }
  }
  return conf
}

function mexcla_join_conference() {
  conf = mexcla_get_conference_number();

  if(conf == 0) {
    alert("Failed to capture the conference number. Please try again.");
    return;
  }

  // We have to send the conference number in single digits followed by #.
  digits = conf.split('');
  for (var i = 0; i < digits.length; i++) {
    // If we send the digits too quickly freeswitch can't process
    // them reliably.
    mexcla_pause(200);
    mexcla_dtmf(digits[i]);
  }
  mexcla_pause(200);
  mexcla_dtmf('#');
  // If the conference number starts with a 6 - it means it's a big
  // group call, so we want people to start off muted.
  // Wait a few seconds for the call to fully complete, then start off the
  // user muted, so we don't have a cacaphony of noise as new people join.
  if(digits[0] == 6) {
    setTimeout(mexcla_mic_mute, 7000);
  }
}

function mexcla_dtmf(key) {
  if(cur_call) {
    var ret = cur_call.dtmf(key);
    return true;
  } else {
    alert(lang_not_yet_connected);
    return false;
  }
}

function mexcla_check_radio_button(id) {
  document.getElementById(id).checked = true;

}

// Make the interval id global
intervalId = 0;
function change_submit_button_value(val) {
  $('#connect-button-text').text(val);
  var current_src = $('#phone').attr('src');
  var target_src = '';
  if(val == lang_connect) {
    // We're disconnecting, so change the picture to the
    // disconnected phone.
    target_src = current_src.replace('phone.connected.png', 'phone.disconnected.png');
  }
  else if(val  == lang_disconnect) {
    // We're connecting... kill the dots animation.
    clearInterval(intervalId);
    // Ensure there are no current dots.
    mexcla_dots('');
    target_src = current_src.replace('phone.disconnected.png', 'phone.connected.png');
    $('#microphone-status').show();
  }
  else {
    // When we are connecting... the picture should remain showing
    // the disconnected phone.
    // However, we should update the text to add an animation effect
    // of the dots progressing...
    intervalId = setInterval(mexcla_dots,500);
    return;
  }
  $('#phone').attr('src', target_src);
}

// Simulate an animation of dots
function mexcla_dots(next) {
  // Can't pass default values, so set it here. The default
  // value should be null
  next = typeof next === 'undefined' ? null : next;
  cur = $('#connect-dots').text();
  if (next === null) {
    next = '';
    if(cur == '') {
      next = '.';
    }
    else if(cur == '.') {
      next = '..';
    }
    else if(cur == '..') {
      next = '...';
    }
  }
  $('#connect-dots').text(next);
}

function mexcla_mic_mute() {
  if(cur_call) {
    cur_call.setMute('off');
    mexcla_check_radio_button('mic-mute');
    var current_src = $('#mic').attr('src');
    target_src = current_src.replace('mic.unmuted.png', 'mic.muted.png');
    $('#mic').attr('src', target_src);
  }
}
function mexcla_mic_unmute() {
  if(cur_call) {
    cur_call.setMute('on');
    mexcla_check_radio_button('mic-unmute');
    var current_src = $('#mic').attr('src');
    target_src = current_src.replace('mic.muted.png', 'mic.unmuted.png');
    $('#mic').attr('src', target_src);
  }
}

function mexcla_mode_original() {
  if(mexcla_dtmf('0')) {
    var current_src = $('#headset').attr('src');
    target_src = current_src.replace(/headset\.(terp|mono)\.png/, 'headset.bi.png');
    $('#headset').attr('src', target_src);
    mexcla_check_radio_button('mode-original');
  }
}
function mexcla_mode_hear_interpretation() {
  if(mexcla_dtmf('1')) {
    var current_src = $('#headset').attr('src');
    target_src = current_src.replace(/headset\.(bi|terp)\.png/, 'headset.mono.png');
    $('#headset').attr('src', target_src);
    mexcla_check_radio_button('mode-hear-interpretation');
  }
}
function mexcla_mode_provide_interpretation() {
  if(mexcla_dtmf('2')) {
    var current_src = $('#headset').attr('src');
    target_src = current_src.replace(/headset\.(bi|mono)\.png/, 'headset.terp.png');
    $('#headset').attr('src', target_src);
    mexcla_check_radio_button('mode-provide-interpretation');
  }
}

// Thanks to http://stackoverflow.com/questions/951021/what-do-i-do-if-i-want-a-javascript-version-of-sleep
// I realize this is "wrong" and freezes up the browser, but setTimeout doesn't
// seem to work when called within the sipml context.
function mexcla_pause(s) {
  var date = new Date();
  var curDate = null;
  do { curDate = new Date(); }
  while(curDate - date < s);
}

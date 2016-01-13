var cur_call = null;
var verto;

// my_key keeps track of the user's unique id for this call,, which is
// used as the css/dom id for the user's row in the participants list.
var my_key = null;

// liveArray is the object that keeps track of all the participants
// on the call.
var liveArray = null;

// sessid represents the session id for this conference. Not sure how
// to use this yet...
var sessid = null;

// chatID is used to ensure we only send chat messages to our conference.
var chatID = null;

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

function mexcla_setup_chat() {
  $("#chatsend").click(function() {
	  if (!cur_call) {
	    return;
	  }
    mexcla_send_message($("#chatmsg").val());
	  $("#chatmsg").val("");
  });

  $("#chatmsg").keyup(function (event) {
    if (event.keyCode == 13 && !event.shiftKey) {
	    $( "#chatsend" ).trigger( "click" );   
	  }
  });
}

function mexcla_send_message(msg) {
  cur_call.message({to: chatID, 
    body: msg,
    from_msg_name: $("#name").val(), 
    from_msg_number: mexcla_get_conference_number()
 });
}

function mexcla_toggle_call_status() {
  if(cur_call) {
    mexcla_hangup();
  } else {
    mexcla_call_init();
  }
}

function mexcla_hangup() {
  if(cur_call) {
    cur_call.hangup();
    // Unset cur_call so when the user tries to re-connect
    // we know to re-connect
    cur_call = null;
  }
  change_submit_button_value(lang_connect);
}

function mexcla_init() {
  conf = mexcla_get_conference_number();
  console.log("Conference is: " + conf);
  $('.pstn-instructions-conference-number').append(conf);
  $("#pad-link").attr("href", "https://pad.riseup.net/p/mexcla-" + conf)
  mexcla_init_language_links();
  mexcla_login();
  mexcla_setup_chat();
}

verto_obj_callbacks = {
  onMessage: function(verto, dialog, msg, data) {
    if (msg == $.verto.enum.message.info) {
      // Handle chat message.
      mexcla_message_event(data);
    }
    if (msg == $.verto.enum.message.pvtEvent) {
      // Handle change in conference participants.
      if (data.pvtData) {
        // chatID is a global variable that represents this conference.
        // It is used for sending chat messages to ensure we only send/receive
        // to our conference.
        chatID = data.pvtData.chatID;
        if (data.pvtData.action == "conference-liveArray-join") {
          var context = data.pvtData.laChannel;
          var name = data.pvtData.laName;
          var laConfig = { subParams: { callID: dialog } };
          liveArray = new $.verto.liveArray(verto, context, name, laConfig); 
          liveArray.onChange = function(obj, args) {
            if (args.action) {
              // bootObj means the initial object when we first join.
              if (args.action == 'bootObj') {
                if (data.eventChannel) {
                  sessid = data.eventChannel;
                }
                for (i = 0; i < args.data.length; i++) {
                  var key = args.data[i][0];
                  // The number for web paricipants is the same as the
                  // conference number (not very helpful). But for phone in
                  // participants, it's their phone number, which  might be a
                  // useful way to identify them if the auto-lookup of caller
                  // id is not successful.
                  var number = args.data[i][1][1];
                  var name = args.data[i][1][2];

                  if (number && number != mexcla_get_conference_number()) {
                    name = name + ' (' + number + ')';
                  }
                  var dataProps = $.parseJSON(args.data[i][1][4]);
                  mexcla_add_member(key, name);
                  mexcla_set_member_talking(key, dataProps.audio.talking);
                }
              }
              // A new members is added.
              if (args.action == 'add') {
                var key = args.key;
                var number = args.data[1];
                var name = args.data[2];
                if (number && number != mexcla_get_conference_number()) {
                  name = name + ' (' + number + ')';
                }
                mexcla_add_member(key, name);
              }
              // A member has left.
              if (args.action == 'del') {
                var key = args.key;
                $("#" + key).remove();
              }
              // A member has been modified (started/stopped talking etc)
              if (args.action == 'modify') {
                var key = args.key;
                // var talking = args.data[4].audio.talking;
                var dataProps = $.parseJSON(args.data[4]);
                mexcla_set_member_talking(key, dataProps.audio.talking);
              }
            }
          }
        }
      }
    }
  }
}

verto_call_callbacks = {
  onDialogState: function(d) {
    cur_call = d;
    switch (d.state) {
      case $.verto.enum.state.requesting:
        change_submit_button_value(lang_connecting);
        break;
      case $.verto.enum.state.active:
        change_submit_button_value(lang_disconnect);
        mexcla_join_conference();
        // Record what my unique key is so I can reference it when sending 
        // special chat messages.
        my_key = cur_call.callID;
        break;
      case $.verto.enum.state.hangup:
        mexcla_hangup();
        break;
    }
  }
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
  }, verto_obj_callbacks);
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
   
  // Ensure they filled in their name
  if(!$("#name").val()) {
    alert("Please enter a name to join the call.");
    return false;
  }
  if(cur_call) {
    return;
  }

  cur_call = verto.newCall({
    destination_number: "9999",
    caller_id_name: $("#name").val(),
    caller_id_number: conf,
    useVideo: false,
    useStereo: false
  }, verto_call_callbacks);

  // Initialize radio buttons
  mexcla_check_radio_button('mic-unmute');
  mexcla_check_radio_button('mode-original');
  // Specify function to run if the user navigates away from this page.
  $.verto.unloadJobs = [ mexcla_unload ];
}

function mexcla_unload() {
  // If the user navigates away from the page, be sure to hang up the 
  // call. Otherwise, they will remain as a ghost in the conference
  // and if they reload the page, they will be connected twice.
  mexcla_hangup();
}

function mexcla_message_event(data) {
  body = data.body;
  from = data.from_msg_name;
  // Filter out special cmds.
  if(body.search("^/location:") != -1) {
    cmd_parts = body.split(':');
    cmd = cmd_parts[0];
    value = cmd_parts[1];
    uid = cmd_parts[2];
    if(cmd == "/location") {
      switch(value) {
        case "original":
          value = lang_hear_original_language;
          break;
        case "interpretation-hear":
          value = lang_hear_interpretation;
          break;
        case "interpretation-provide":
          value = lang_provide_interpretation;
      }
      $("tr#" + uid + " td.participant-location").text(value);
    }
  }
  else {
    $('#chat-win')
      .append($('<span class="chatuid" />').text(from + ': '))
      .append(mexcla_text_to_jq(body))
      .append($('<br />'));
    $('#chat-win').animate({"scrollTop": $('#chat-win')[0].scrollHeight}, "fast");
  }
}

function mexcla_add_member(key, name) {
  if ($('#' + key).length) {
    // Don't re-add a member if they have already been added.
    return;
  }
  $("#participant-list").append($("<tr />").attr('id', key));
  $("#" + key).append($('<td />').text(name));
  $("#" + key).append($('<td />').attr('class', 'participant-location').text(lang_hear_original_language));
  $("#" + key).append($('<td />').text("N/A"));
}

function mexcla_set_member_talking(key, talking) {
  if(talking) {
    $("#" + key).css("font-weight","bold");
  }
  else {
    $("#" + key).css("font-weight","normal");
  }
}

// Copied from verto.js library.
function mexcla_text_to_jq(body) {
  // Builds a jQuery collection from body text, linkifies http/https links, imageifies http/https links to images, and doesn't allow script injection
  var match, $link, img_url, $body_parts = $(), rx = /(https?:\/\/[^ \n\r]+|\n\r|\n|\r)/;
  while ((match = rx.exec(body)) !== null) {
    if (match.index !== 0) {
      $body_parts = $body_parts.add(document.createTextNode(body.substr(0, match.index)));
    }

    if (match[0].match(/^(\n|\r|\n\r)$/)) {
      // Make a BR from a newline
      $body_parts = $body_parts.add($('<br />'));
      body = body.substr(match.index + match[0].length);
    } else {
      // Make a link (or image)
      $link = $('<a target="_blank" />').attr('href', match[0]);
      
      if (match[0].search(/\.(gif|jpe?g|png)/) > -1) {
        // Make an image
        img_url = match[0];

        // Handle dropbox links
        if (img_url.indexOf('dropbox.com') !== -1) {
          if (img_url.indexOf('?dl=1') === -1 && img_url.indexOf('?dl=0') === -1) {
            img_url += '?dl=1';
          } else if (img_url.indexOf('?dl=0') !== -1) {
            img_url = img_url.replace(/dl=0$/, 'dl=1');
          }
        }

        $link.append($('<img border="0" class="chatimg" />').attr('src', img_url));
      } else {
        // Make a link
        $link.text(match[0]);
      }

      body = body.substr(match.index + match[0].length);
      $body_parts = $body_parts.add($link);
    }
  }
  if (body) {
    $body_parts = $body_parts.add(document.createTextNode(body));
  }
  return $body_parts;
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

  mexcla_dtmf(conf + '#');
  // If the conference number starts with a 6 - it means it's a big
  // group call, so we want people to start off muted.
  // Wait a few seconds for the call to fully complete, then start off the
  // user muted, so we don't have a cacaphony of noise as new people join.
  if(conf[0] == 6) {
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
  if(val == lang_connect) {
    $('#call-options').hide();
    // Keep the chat windows showing in case there are notes people still
    // want to keep.
  }
  else if(val == lang_disconnect) {
    // We're connecting... kill the dots animation.
    clearInterval(intervalId);
    // Ensure there are no current dots.
    mexcla_dots('');
    $('#call-options').show();
    $('#chat-and-participants').show();
  }
  else {
    // When we are connecting... we should update the text to add an animation effect
    // of the dots progressing...
    intervalId = setInterval(mexcla_dots,500);
    return;
  }
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
    mexcla_send_message("/location:original:" + my_key);
  }
}
function mexcla_mode_hear_interpretation() {
  if(mexcla_dtmf('1')) {
    var current_src = $('#headset').attr('src');
    target_src = current_src.replace(/headset\.(bi|terp)\.png/, 'headset.mono.png');
    $('#headset').attr('src', target_src);
    mexcla_check_radio_button('mode-hear-interpretation');
    mexcla_send_message("/location:interpretation-hear:" + my_key);
  }
}
function mexcla_mode_provide_interpretation() {
  if(mexcla_dtmf('2')) {
    var current_src = $('#headset').attr('src');
    target_src = current_src.replace(/headset\.(bi|mono)\.png/, 'headset.terp.png');
    $('#headset').attr('src', target_src);
    mexcla_check_radio_button('mode-provide-interpretation');
    mexcla_send_message("/location:interpretation-provide:" + my_key);
  }
}


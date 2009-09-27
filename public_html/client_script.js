var
  currently_editing = null;

window.addEventListener(
  'load',
  function()
  {
    //Notifier.show('Just testing badgie thing');
    var
      i = 0,
      elem = null;

    // add onchange handler to checkboxes
    var elems = document.selectNodes('//input[@type="checkbox"]');
    for( i=0; elem=elems[i]; i++ )
    {
      elem.addEventListener('change', toggleScript, false);
    }

    // add click handler to expand script options
    elems = document.selectNodes('//form[@name]');
    for( i=0; elem=elems[i]; i++ )
    {
      elem.addEventListener('click', toggleOptions, false);
    }

    // add handler to directory items
    elems = document.selectNodes('//button[@class="folder"]');
    for( i=0; elem=elems[i]; i++ )
    {
      elem.addEventListener('click', changeDirectory, false);
    }

    // add click handler to edit icons
    elems = document.selectNodes('//button[@class="edit"]');
    for( i=0; elem=elems[i]; i++ )
    {
      elem.addEventListener('click', openSettings, false);
    }
    // add click handler to delete button
    elems = document.selectNodes('//button[@class="delete"]');
    for( i=0; elem=elems[i]; i++ )
    {
      elem.addEventListener('click', deleteScript, false);
    }

    // add click handler to toggle button
    elems = document.selectNodes('//button[@class="toggle"]');
    for( i=0; elem=elems[i]; i++ )
    {
      elem.addEventListener('click', toggleScript, false);
    }

    elem = $('close_notifier');
    elem.addEventListener('click', remindMeLater, false);

    // add handler for quick search
    var qf = document.selectSingleNode('//input[@id="quickfind"]');
    if ( qf )
    {
      qf.addEventListener(
        'focus',
        function() { if (this.value == 'Quick find') this.value = ''; }
        , false
      );
      qf.addEventListener(
        'input',
        function(e) { filterScripts(e.target.value); },
        false
      );
    }

  },
  false
);

function $(id) { return document.getElementById(id); }

var Notifier = new function()
{
  var
    _el = null,
    _timeout = null;

  this.show = function(msg, timeout)
    {
      if ( !_el ) init();

      $('msg').textContent = msg;

      _el.style.display = 'block';
      _el.style.marginTop = -_el.scrollHeight+'px';

      _timeout = timeout;
      animateDown();
    };

  this.hide = function()
    {
      animateUp();
    };

  var init = function()
    {
      _el = $('notifier');
      $('close').onclick = animateUp;
    };

  var animateDown = function()
    {
      _el.style.marginTop = (parseInt(_el.style.marginTop)+2) + 'px';

      if ( parseInt(_el.style.marginTop) < 0 )
        setTimeout( arguments.callee, 10 );
      else
      {
        _el.style.marginTop = 0;
        if ( _timeout )
        {
          setTimeout( animateUp, _timeout );
          _timeout = false;
        }
      }
    };

  var animateUp = function()
    {
      if ( !_el.cachedHeight)
        _el.cachedHeight = -_el.scrollHeight;

      if ( parseInt(_el.style.marginTop) > _el.cachedHeight )
      {
        _el.style.marginTop = (parseInt(_el.style.marginTop)-4) + 'px';
        _timeout = setTimeout( arguments.callee, 10 );
      }
      else
      {
        _el.style.marginTop = -_el.scrollHeight+'px';
        _el.cachedHeight = null;
      }
    }
}

function remindMeLater()
{
  var close_button = this;

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'remindmelater'
      },
      onSuccess   : function(req)
                    {
                      // hide notifier
                      close_button.parentNode.style.display = 'none';
                    }
    }
  );
}

function openSettings(ev)
{
  var script_form = ev.target.form;

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'getsettings',
        filename  : script_form.name,
      },
      onSuccess   : function(req)
                    {
                      try
                      {
                        var result = eval('('+req.responseText+')');
                        if ( result instanceof Object)
                        {
                          return openScriptSettings(script_form.name, result);
                        }
                        alert("Can't find any settings for this script!");
                      }
                      catch(e){}
                    }
    }
  );
}

function openScriptSettings(filename, options)
{
  var settings_el = $('settings');
  while (settings_el.firstChild)
  {
    settings_el.removeChild(settings_el.firstChild);
  }

  currently_editing = filename;

  for( var i=0,op; op=options[i]; i++ )
  {
    settings_el.appendChild( buildOption(op, i) );
  }

  $('settings_title').textContent = $('settings_title').title = filename;
  $('scripts_list').style.visibility = 'hidden';
  $('quickfind_container').style.visibility = 'hidden';
  $('settings_container').style.display = 'block';
}

function closeScriptSettings()
{
  currently_editing = null;
  $('settings_container').style.display = 'none';
  $('scripts_list').style.visibility = 'visible';
  $('quickfind_container').style.visibility = 'visible';
}

function buildOption(op, index)
{
  var
    cont = document.createElement('div'),
    ul = document.createElement('ul'),
    li = document.createElement('li'),
    el;

  switch (op.type)
  {
    case 'bool':
      el = document.createElement('input');
      el.type = 'checkbox';
      el.id = 'el'+index;
      el.checked = ( op.value=='true' ? true : false );
      el.addEventListener('change', changeSetting, false);
      // argh, hack for bool - append before text
      li.appendChild(el);
      ul.appendChild(li);
      break;
    case 'int':
      el = document.createElement('button');
      el.className = 'setting_elem';
      el.type = 'number';
      el.value = op.value;
      el.textContent = op.value;
      break;
    case 'string':
    case 'regexp':
      el = document.createElement('span');
      el.className = 'setting_elem';
      el.type = 'text';
      el.onclick = editSetting;
      el.value = el.title = op.value;
      el.textContent = op.value;
      break;
  }

  el.setAttribute('name', op.name);
  el.exactmatch = op.exactmatch;

  // use leading underscores as indent level
  var indent_lev = op.name.match(/^_+/);
  if ( indent_lev )
  {
    indent_lev = indent_lev[0].length;
    op.name = op.name.replace(/^_+/,'');
    ul.className = 'indent'+indent_lev;
  }

  li = document.createElement('li');
  var label = document.createElement('label');
  label.textContent = op.name;
  label.title = op.name;
  label.setAttribute('for', 'el'+index);
  li.appendChild(label);
  ul.appendChild(li);

  if ( ul.childNodes.length<2 )
  {
    li.appendChild(el);
    ul.appendChild(li);
  }

  return cont.appendChild(ul);
}

function editSetting(ev)
{
  var edit = $('edit_field');

  edit.value = ev.target.value;
  edit.related = ev.target;

  $('edit_dialog').style.display = 'block'
}

function saveEditedSetting(form)
{
  form.edit_field.disabled = true;
  form.edit_field.value =
    form.edit_field.value.replace(/[\r\n]+/g, '');

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'changesetting',
        filename  : currently_editing,
        exactmatch: form.edit_field.related.exactmatch,
        name      : form.edit_field.related.name,
        value     : form.edit_field.value
      },
      onSuccess   : function(req)
                    {
                      try
                      {
                        var result = eval('('+req.responseText+')');
                        if ( result )
                        {
                          closeEditDialog();
                          form.edit_field.related.exactmatch = result.exactmatch;
                          form.edit_field.related.value =
                            form.edit_field.related.textContent =
                            result.value;
                        }
                      }
                      catch(e){}
                      form.edit_field.disabled = false;
                    }
    }
  );
}

function closeEditDialog()
{
  $('edit_field').value = '';
  $('edit_dialog').style.display = 'none';
}

function toggleOptions(ev)
{
  var
    target = ev.target,
    elem = this.selectSingleNode('descendant-or-self::div[@class="desc"]');

  // only proceed when clicked on form or script name (UGLY HACK)
  if ( !(target.className == 'name' || target.nodeName == 'FORM') )
  {
    return;
  }

  // roll up all open options
  var elems = document.selectNodes('//div[@class="desc"]');
  for ( var i=0; i<elems.length; i++ )
  {
    // skip clicked element (we want to be able to close expanded options)
    if ( elem == elems[i] ) continue;
    elems[i].style.display = 'none';
  }

  elem.style.display = ( elem.style.display != 'block' ? 'block' : 'none' );

  ev.preventDefault();
}

function deleteScript(ev)
{
  var script_form = this.form;

  if ( script_form.name && confirm('Do you really want to delete script:\n' +
               decodeURIComponent(script_form.name) + '?') )
  {
    AjaxRequest.post(
      {
        parameters  :
        {
          action    : 'delete',
          filename  : script_form.name
        },
        onSuccess   : function(req)
                      {
                        var obj = parse_response(req.responseText);
                        if ( !obj.error )
                        {
                          script_form.parentNode.parentNode.removeChild(
                            script_form.parentNode);
                        }
                        else
                        {
                          // revert previous checkbox state
                          alert(obj.error);
                        }
                      }
      }
    );
  }
}

function toggleScript(ev)
{
  var script_form = ev.target.form;

  script_form.check.disabled = true;

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'toggle',
        filename  : script_form.name,
        enable    : script_form.check.checked
      },
      onSuccess   : function(req)
                    {
                      var obj = parse_response(req.responseText);
                      if ( !obj.error )
                      {
                        script_form.name = obj.result;
                        if ( ev.target.tagName == 'BUTTON' )
                          ev.target.firstChild.className = ( obj.enabled ? 'disabled' : '' );
                      }
                      else
                      {
                        // revert previous checkbox state
                        //script_form.check.checked = !script_form.check.checked;
                        alert(obj.error);
                      }

                      script_form.check.checked = obj.enabled;
                      script_form.check.disabled = false;
                    }
    }
  );
}

function changeDirectory(ev)
{
  var form = ev.target.form;

  location.href = location.pathname + '?dir=' + form.name;
}

function changeSetting(ev)
{
  if ( !currently_editing )
    return;

  var val = null;
  switch(ev.target.type)
  {
    case 'checkbox':
      val = ev.target.checked;
      break;
    case 'text':
    case 'number':
      val = ev.target.value;
      break;
  }
  if ( val === null ) return false;

  ev.target.disabled = true;

  AjaxRequest.post(
    {
      parameters  :
      {
        action    : 'changesetting',
        filename  : currently_editing,
        exactmatch: ev.target.exactmatch,
        name      : ev.target.name,
        value     : val
      },
      onSuccess   : function(req)
                    {
                      try
                      {
                        var result = eval('('+req.responseText+')');

                        var inp = ev.target;

                        // if success - update input values
                        if ( result && inp.name == result.name )
                        {
                          inp.exactmatch = result.exactmatch;
                          switch(inp)
                          {
                            case 'checkbox':
                              inp.checked = ( result.value == true ? true : false );
                              break;
                            case 'text':
                            case 'number':
                              inp.value = result.value;
                              break;
                          }
                        }
                      }
                      catch(e){}
                      ev.target.disabled = false;
                    }
    }
  );
}

function filterScripts(text)
{
  var show_all = false;

  if (text.length == 0) show_all = true;
  else if (text.length < 2) return;

  text = text.toLowerCase();

  var nodes = $('scripts_list').selectNodes('descendant-or-self::span[@class="name"]');
  for (var i = 0, node; node=nodes[i]; i++) {
    if (node.textContent.toLowerCase().indexOf(text) == -1)
      node.selectSingleNode('ancestor-or-self::li').style.display = 'none';
    else
      node.selectSingleNode('ancestor-or-self::li').style.display = 'block';
  }
}

function parse_response(resp) {
  try {
    return eval('(' + resp + ')');
  } catch(e) {}
  return false;
}
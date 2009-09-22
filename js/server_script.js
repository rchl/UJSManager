/*
 *
 * UJS Manager Unite Application
 * Rafal Chlodnicki, 2009
 *
 */

var
  dir = null, //opera.io.filesystem.mountSystemDirectory('shared');
  new_version_available = false,
  service_doap = 'http://unite.opera.com/service/doap/401/',
  service_path = 'http://' + opera.io.webserver.hostName + opera.io.webserver.currentServicePath,
  mnt = opera.io.filesystem.mountSystemDirectory('application'),
  static_files = [],
  data = { scripts: getAllUserScripts(null, true) };


sharePublicHtml();

opera.io.webserver.addEventListener( '_request', handleRequest, false );


function handleRequest( event )
{
  var response = event.connection.response;
  var request = event.connection.request;

  if ( isPublicFile(request.uri) )
  {
    response.closeAndRedispatch();
    return;
  }

  // ok, this is before isOwner check because we want user to be able to install script from
  // normal pages. We could redirect to admin page but that would cause frightening unite redirect
  // warning page. Instead, we redirect from script file to public service address and then to
  // admin service address without causing warnings. An admin page is where all the magic happens
  // and remote users can't connect to it anyway.
  if ( !event.connection.isOwner )
  {
    if ( request.queryItems['install_script'] )
    {
      var tpldata = {
        admin_url   : 'http://admin.' + request.host + opera.io.webserver.currentServicePath,
        install_url : request.queryItems['install_script'][0]
      };
      var template = new Markuper( 'templates/dialog.html', tpldata );

      response.write( template.parse().html() );
      response.close();
      return;
    }

    response.write( "UJS Manager is made to be only accessible from Opera running this service." );
    response.close();
    return;
  }

  if ( request.queryItems['install_script'] )
  {
    var script_uri = decodeURIComponent(request.queryItems['install_script'][0]);
    widget.showNotification(
      downloadScript(script_uri) ?
        'User script installed "' + script_uri + '".'
        : 'Error installing "' + script_uri + '"!'
    );
    response.setStatusCode('303');
    response.setResponseHeader('Location', 'http://' + request.host + opera.io.webserver.currentServicePath);
    response.close();
    return;
  }

  // handle xhr calls with json
  if ( request.bodyItems['action'] )
  {
    var resp = handleXHRQuery(request.bodyItems);
    response.write(JSON.stringify(resp));
    response.close();
    return;
  }

  var
    dir_query = null,
    istopdir = true;

  if ( request.queryItems['dir'] )
  {
    dir_query = request.queryItems['dir'][0];
    istopdir = false;
  }

  data.scripts = getAllUserScripts(dir_query, istopdir);
  var template = new Markuper( 'templates/tpl.html', data );

  response.write( template.parse().html() );
  response.close();
}

function handleXHRQuery(query)
{
  var
    action = query['action'][0],
    q_filename = query['filename'][0];

  switch (action)
  {
    case 'toggle':
      var
        newpath = null,
        q_enable = query['enable'][0],
        File = dir.resolve( q_filename );

      if ( File && File.exists )
      {
        if ( q_enable === 'true' )
        {
          newpath = File.path.replace(/\.js\.xx$/i, '.js');
        }
        else
        {
          newpath = File.path.replace(/\.js$/i, '.js.xx');
        }

        // make sure new path does not overwrite any other file
        if ( newpath && !dir.resolve(newpath).exists )
        {
          File = File.moveTo(newpath);
        }
        else
        {
          return {error: "Error. Script with file name " + newpath + " already exists!"};
        }
        return {result: decodeURIComponent(File.name)};
      }
      break;

    case 'getsettings':
      return getScriptSettings(q_filename);
      break;
    case 'changesetting':
      var q_exactmatch = query['exactmatch'][0];
      var q_name = query['name'][0];
      var q_value = query['value'][0];
      return changeScriptSetting(q_filename, q_exactmatch, q_name, q_value);
      break;
  }
  return false;
}

function sharePublicHtml()
{
  var public_dir = mnt.resolve('/public_html/');
  public_dir.refresh();

  for ( var i=0,file; file=public_dir[i]; i++ )
  {
    if ( file.isFile )
    {
      var path = file.path, match = null;
      if ( match = file.path.match(/(\/[^\/]+)$/) )
      {
        path = match[1];
      }
      static_files.push( path );
    }
  }
}

function isPublicFile(uri)
{
  for ( var i=0; i<static_files.length; i++ )
  {
    var item = static_files[i];
    if ( uri.indexOf(item)>-1 )
      return true;
  }
  return false;
}

/**
  * Creates object from user script file
  * @returns script object
  */
function getUserScript(File)
{
  var obj = {
      prettyname  : decodeURIComponent(File.name.replace(/\.xx$/i, '')),
      filename    : File.name,
      isenabled   : ( ( /\.js$/i.test(File.name) ) ? true : false ),
      isdirectory : false,
      hassettings : false,
      filecontent : readFile(File.path),
      header      : null
    };

  if ( obj.filecontent )
  {
    // if at last one setting found in file then add edit button
    if ( obj.filecontent.match(/\/\*@[^@]+@(bool|int|string)@\*\/.+\/\*@\*\//g) )
    {
      obj.hassettings = true;
    }

    // read script header
    obj.header = getUserScriptHeader(obj.filecontent);
    if ( obj.header )
    {
      // try to get pretty name
      obj.prettyname = obj.header.name||obj.prettyname;
    }
  }
  return obj;
}

/**
  * Reads all user scripts in directory
  * @returns array of script objects
  */
function getAllUserScripts(requested_dir, istopdir)
{
  dir = opera.io.filesystem.mountSystemDirectory('shared');
  dir.refresh();

  if ( requested_dir && dir.resolve(requested_dir).exists )
  {
    dir = dir.resolve(requested_dir);
    dir.refresh();
  }

  var
    scripts = [],
    ujs_installer = false;

  // add link to parent directory
  if ( dir.parent.exists )
  {
    scripts.push
    ({
      prettyname  : '..',
      filename    : dir.parent.path.replace('mountpoint:/', ''),
      isdirectory : true
    });
  }

  var obj = null;

  for ( var i = 0, file; file = dir[i]; i++ )
  {
    // special handling for directories
    if ( file.isDirectory )
    {
      scripts.push
      ({
        prettyname  : decodeURIComponent(file.name),
        filename    : file.path.replace('mountpoint:/', ''),
        isdirectory : true
      });

      continue;
    }

    // skip if no js extension (disabled too)
    if ( !(/\.js(\.xx|)$/i.test(file.name)) ) continue;

    obj = getUserScript(file);
    scripts.push( obj );

    // check for user js installer
    if ( obj.prettyname == 'UJS Manager - script installer' )
      ujs_installer = obj;
  }

  // only top directory should get ujs installer script
  if ( istopdir )
  {
    // copy user js installer if not found or older
    var scr_installer = getUserScript( mnt.resolve('/js/ujs_manager_installer.js') );

    if ( !ujs_installer
        || scr_installer.header.version > ujs_installer.header.version
        || ujs_installer.header.servicepath != service_path )
    {
      // add user js installer to list because it wasn't there when reading dir
      if ( !ujs_installer )
        scripts.push( scr_installer );

      // insert current service path to ujs installer
      scr_installer.filecontent = scr_installer.filecontent.replace(
        /\{\{service_path\}\}/g,
        service_path);
      writeFile('ujs_manager_installer.js', scr_installer.filecontent);
    }
  }

  // sort by prettyname
  scripts.sort(
    function(a, b)
    {
      // put directories on top
      if ( a.isdirectory != b.isdirectory )
      {
        return (a.isdirectory?-1:1);
      }
      return (a.prettyname.toLowerCase()<b.prettyname.toLowerCase()?-1:1);
    }
  );

  return scripts;
}

/**
  * creates key-value object from user script header
  */
function getUserScriptHeader(content)
{
  var
    start = content.indexOf('// ==UserScript=='),
    end = content.indexOf('// ==/UserScript=='),
    desc = null;

  if ( start!=-1 && end!=-1 )
  {
    // add length of header start string
    start += 18
    desc = content.substr(start, end-start);
    // remove trailing/ending spaces
    desc = desc.replace(/(^\s+|\s+$)/, '');
    // remove some stuph
    desc = desc.replace(/^\/\/\s+/gm, '');
  }

  if ( !desc )
    return null;

  var
    lines = desc.split('\n'),
    line,
    rgx_match = null,
    line_rgx = /^@(.+?)\s+(.+)/,
    obj = {};

  for ( var i=0; i<lines.length; i++ )
  {
    line = lines[i];
    // skip empty lines
    if ( !line ) continue;

    rgx_match = line.match(line_rgx);
    if ( rgx_match && rgx_match.length > 1 )
    {
      obj[rgx_match[1]] = rgx_match[2];
    }
  }
  return (obj?obj:null);
}

function getScriptSettings(filename)
{
  var ret = [];

  var content = readFile(filename);
  if ( !content ) return false;

  // matches all options of kind /*@opname@optype@*/opvalue/*@*/
  var matches = content.match(/\/\*@[^@]+@(bool|int|string|regexp)@\*\/.*\/\*@\*\//g);
  if ( !matches ) return false;

  // matches individual types of given option
  var optionmatch = /^\/\*@([^@]+)@([^@]+)@\*\/(.*)\/\*@\*\/$/;

  /*
   * option object:
   *  name,
   *  type,
   *  value,
   *  exactmatch
   */
  for ( var i=0; i<matches.length; i++ )
  {
    var match = matches[i].match(optionmatch);
    ret.push({
      name        : match[1],
      type        : match[2],
      value       : match[3],
      exactmatch  : matches[i]
    });
  }
  return ret;
}

function changeScriptSetting(filename, exactmatch, name, value)
{
  var content = readFile(filename);

  var newval = exactmatch.replace(/\*\/.*\/\*@\*\/$/, '*/'+value+'/*@*/');

  content = content.replace(exactmatch, newval);

  if ( writeFile(filename, content) )
  {
    return {
      filename  : filename,
      name      : name,
      value     : value,
      exactmatch: newval
    };
  }
  return {};
}

function readFile(f)
{
  // accepts file object or file path
  var
    Stream = null,
    str;

  if ( typeof f == 'string' )
  {
    f = dir.resolve(f);
  }

  if ( f && f.exists )
  {
    Stream = f.open(f, opera.io.filemode.READ)
    str = Stream.read( Stream.bytesAvailable );
    Stream.close();
    return str;
  }
  return null;
}

function writeFile(path, content)
{
  var File = null;

  if ( path && content && (File=dir.resolve(path)) )
  {
    var stream = dir.open(path, 'w');
    stream.write(content);
    stream.close();
    return true;
  }
  return false;
}

function createFile(path, content)
{
  if ( !(dir.resolve(path)).exists )
    return writeFile(path, content);
  return false;
}

/**
  * downloads file using synchronous XHR
  */
function downloadScript(uri)
{
  var xhr = new XMLHttpRequest();
  xhr.open('GET', uri, false);
  xhr.setRequestHeader('Cache-Control', 'no-cache');
  try
  {
    xhr.send();
  }
  catch(e)
  {
    // will throw for local files for example
    return false;
  }

  // little validation to make sure it's javascript
  if ( xhr.getResponseHeader('Content-type').indexOf('javascript') == -1 )
    return false;

  if ( !xhr.responseText )
    return false;

  // extract file name from path
  var filename = uri.match(/.+\/([^/?]+)/);
  if ( filename )
    filename = filename[1];
  else
    return false;

  // create user script file
  return createFile(filename, xhr.responseText);
}

var savePref = function(key, val)
{
  return widget.setPreferenceForKey(encodeURIComponent(val), key);
}

var getPref = function(name)
{
  return decodeURIComponent(widget.preferenceForKey(name))||null;
}

/**
  * update checking
  */
var updater = new function()
{
  if ( !window.widget )
    return false;

  var latest_ver = getPref('latestVer');
  var last_check = getPref('lastCheck');

  this.checkUpdate = function()
  {
    var cur_date = new Date().getTime();

    if ( last_check )
    {
      var days_since_check = (cur_date-last_check)/(1000*60*60*24);
      if ( days_since_check < 3 ) return false;
    }

    savePref('lastCheck', cur_date);

    var req = new XMLHttpRequest();
    req.onreadystatechange = function()
    {
      if ( req.readyState == 4 )
      {
        var
          doap = req.responseXML,
          remoteVersion = null;

        if ( !doap ) return false;

        var nsresolve = function(ns)
        {
          switch(ns)
          {
            case 'rdf': return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
            case 'doap': return 'http://usefulinc.com/ns/doap#';
          }
        }

        // compare with current version
        if ( remoteVersion = doap.selectSingleNode('//rdf:RDF/doap:Project/doap:release/doap:Version/doap:revision', nsresolve) )
        {
          remoteVersion = remoteVersion.text;
          if ( latest_ver && parseFloat(remoteVersion) > latest_ver )
            new_version_available = true;
          else
            savePref('latestVer', remoteVersion);
        }
        return false;
      }
    }
    req.open('GET', service_doap);
    req.setRequestHeader('Cache-Control', 'no-cache');
    req.send();
  };
}
updater.checkUpdate();
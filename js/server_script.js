/**
  *
  * UJS Manager Unite Application
  * Rafal Chlodnicki, 2009
  *
  */

var
  SHARED_DIR = opera.io.filesystem.mountSystemDirectory('shared'),
  PUBLIC_DIR = opera.io.filesystem.mountSystemDirectory('application'),
  SERVICE_DOAP = 'http://unite.opera.com/service/doap/401/',
  /* DON'T FORGET TO UPDATE VERSION FOR EVERY RELEASE !!! */
  SERVICE_VERSION = '2.1',
  SERVICE_PATH = 'http://' + opera.io.webserver.hostName + opera.io.webserver.currentServicePath,
  SERVICE_PATH_ADMIN = 'http://admin.' + opera.io.webserver.hostName + opera.io.webserver.currentServicePath,
  DATA;


opera.io.webserver.addEventListener( '_request', handleRequest, false );

function handleRequest( event )
{
  var response = event.connection.response;
  var request = event.connection.request;
  var isOwner = event.connection.isOwner; // || (request.ip == '127.0.0.1');

  if ( PublicFiles.isPublic(request.uri) )
  {
    response.closeAndRedispatch();
    return;
  }

  // this block is before isOwner check because we want user to be able to install script from
  // normal pages. We could redirect to admin page but that would cause frightening unite redirect
  // warning page. Instead, we redirect from script file to public service address and then to
  // admin service address without causing warnings. Admin page is where all the magic happens
  // and remote users can't connect to it anyway.
  if ( request.bodyItems['install_script'] )
  {
    // show error if not corect id given
    if ( !request.bodyItems['unique_id']
         || request.bodyItems['unique_id'][0] != getPref('unique_id') )
    {
      response.write( "This won't work. Bad unique id." );
      response.close();
      return;
    }

    // pre-installation dialog which shows script info and install button
    if ( !request.bodyItems['confirm'] )
    {
      var tpldata = {
        admin_url     : SERVICE_PATH_ADMIN,
        install_url   : request.bodyItems['install_script'][0],
        script_body   : request.bodyItems['script_body'][0],
        unique_id     : request.bodyItems['unique_id'][0],
        ask_overwrite : false,
        old_header    : null,
        new_header    : null
      };

      // extract file name from path
      var filename = tpldata.install_url.match(/.+\/([^/?]+)/);
      if ( filename )
      {
        filename = filename[1];
        // check if file already exists and ask for overwrite if yes
        var existing_body = readFile(filename);
        if ( existing_body !== null )
        {
          tpldata.ask_overwrite = true;
          tpldata.old_header = Script.parseHeader(existing_body)||{'<missing>':''};
          tpldata.new_header = Script.parseHeader(tpldata.script_body)||{'<missing>':''};

        }
      }
      else
      {
        response.write( "Error. UJS Manager couldn't extract filename from path." );
        response.close();
        return;
      }

      var template = new Markuper( 'templates/dialog.html', tpldata );
      response.write( template.parse().html() );
      response.close();
      return;
    }
    else if ( isOwner ) // handles actual installation of script after confirming
    {
      var
        script_uri = unescape(request.bodyItems['install_script'][0]),
        script_body = request.bodyItems['script_body'][0],
        overwrite = ( request.bodyItems['overwrite'] ? true : false ),
        filename = script_uri.match(/.+\/([^/?]+)/);

      // we are pretty sure that regexp above will match as it did in install dialog already
      filename = filename[1];

      // install file if there is none already
      widget.showNotification(
        createFile(filename, script_body, overwrite) ?
          ( overwrite ? 'User script "' + filename + '" updated': 'User script "' + filename + '" installed' )
          : 'Error installing "' + filename + '"!'
      );

      // redirect to admin part
      response.setStatusCode('303');
      response.setResponseHeader('Location', SERVICE_PATH_ADMIN);
      response.close();
      return;
    }
  }

  // not owners not allowed unless they request local
  // address which means they are owners (just running without unite account)
  if ( !isOwner )
  {
    var tpldata = {
      msg      : $('<p>UJS Manager is made to be only accessible from Opera running this service.</p>' +
                   '<p>If you are the owner of this service, go to <a href="' + SERVICE_PATH_ADMIN + '" onclick="location.replace(this.href);return false;">Admin section</a>.</p>' +
                   '<p>If you want to download UJS Manager, go to <a href="http://unite.opera.com/application/401/">download page</a>.</p>')
    };

    var template = new Markuper( 'templates/remote.html', tpldata );
    response.write( template.parse().html() );
    response.close();
    return;
  }

  // handle xhr calls with json
  if ( request.bodyItems['action'] )
  {
    var resp = handleXHRRequest(request.bodyItems);
    response.setResponseHeader('Content-type', 'text/plain');
    response.write(JSON.stringify(resp));
    response.close();
    return;
  }

  // set sorting pref
  if ( request.queryItems['sorting'] )
  {
    savePref('sorting', request.queryItems['sorting'][0]);
  }

  var
    dir_query = null,
    istopdir = true;

  if ( request.queryItems['dir'] )
  {
    dir_query = request.queryItems['dir'][0];
    istopdir = false;
  }

  DATA = {
    scripts     : ScriptsDirectory.getAllUserScripts(dir_query, istopdir),
    sorting     : getPref('sorting')||'name',
    version     : SERVICE_VERSION,
    newversion  : Updater.checkUpdate()
  }

  var template = new Markuper( 'templates/tpl.html', DATA );

  response.write( template.parse().html() );
  response.close();
}

function handleXHRRequest(query)
{
  var
    action = query['action'][0],
    q_filename = query['filename'] ? query['filename'][0] : null;

  switch (action)
  {
    case 'toggle':
      var
        newpath = null,
        enabled = null,
        File = SHARED_DIR.resolve( q_filename );

      if ( File && File.exists )
      {
        if ( File.path.match(/\.js\.xx$/i) )
        {
          newpath = File.path.replace(/\.js\.xx$/i, '.js');
          enabled = true;
        }
        else if ( File.path.match(/\.js$/i) )
        {
          newpath = File.path.replace(/\.js$/i, '.js.xx');
          enabled = false;
        }
        else
        {
          return {error: "Error. Script with file name " + q_filename + " is not user script file!"};
        }

        // make sure new path does not overwrite any other file
        if ( newpath && !SHARED_DIR.resolve(newpath).exists )
        {
          File = File.moveTo(newpath);
        }
        else
        {
          return {
            error: "Error. Script with file name " + newpath.replace(/.*\/([^\/]+)$/, '$1') + " already exists!",
            enabled: !enabled
          };
        }

        ScriptsDirectory.hasChanged();
        return {
          result: unescape(File.name),
          enabled: enabled
        };
      }
      break;

    case 'getsettings':
      return getScriptSettings(q_filename);
      break;
    case 'changesetting':
      var q_exactmatch = query['exactmatch'][0];
      var q_name = query['name'][0];
      var q_value = query['value'][0];
      return Script.changeSetting(q_filename, q_exactmatch, q_name, q_value);
      break;
    case 'delete':
      var result = deleteFile(q_filename);
      ScriptsDirectory.hasChanged();
      return result||{error: 'Deleting file failed!'};
    case 'readtxt':
      return readFile(q_filename)||{error: "Wasn't able to read file or file empty!"}
    case 'writetxt':
      var File = null;
      if (File=writeFile(q_filename, query['data'][0], query['can_overwrite']))
      {
        if (query['can_overwrite'])
        {
          // modified existing file
          return ScriptsDirectory.getUserScript(File);
        }
        else
        {
          // created new file
          ScriptsDirectory.hasChanged();
          var arr = [];
          arr.push(ScriptsDirectory.getUserScript(File));
          var template = new Markuper( 'templates/tpl.html', { scripts: arr } );
          return { new_script: template.parse().select('#scripts_list')[0].innerHTML };
        }
      }
      else
        return {error: "Wasn't able to write file. Possibly file with that name already exists!"};
    case 'haschanged':
      return { modified: ScriptsDirectory.hasChanged() };
    case 'remindmelater':
      Updater.remindMeLater();
      return true;
    default:
      return {error: 'Option not implemented!'};
  }
  return false;
}

/**
  * Script object
  */
var Script = new function()
{
  /**
    * creates key-value object from user script header
    * @return object of key-value pairs
    */
  this.parseHeader = function(content)
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
      data = [];

    for ( var i=0; i<lines.length; i++ )
    {
      line = lines[i];
      // skip empty lines
      if ( !line ) continue;

      rgx_match = line.match(line_rgx);
      if ( rgx_match && rgx_match.length > 1 )
      {
        var name = rgx_match[1], val = rgx_match[2];
        data.push( { key: name, value: trim(val) } );
      }
    }
    return (data?data:null);
  }

  this.changeSetting = function(filename, exactmatch, name, value)
  {
    var content = readFile(filename);

    var newval = exactmatch.replace(/\*\/.*\/\*@\*\/$/, '*/'+value+'/*@*/');

    content = content.replace(exactmatch, newval);

    if ( writeFile(filename, content, true) )
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
}

/**
  * Scripts Directory object
  */
var ScriptsDirectory = new function()
{
  // used to check for modifications made in directory
  var files_arr = [];

  /**
    * Reads all user scripts in directory
    * @returns array of script objects
    */
  this.getAllUserScripts = function(requested_dir, istopdir)
  {
    if ( requested_dir && SHARED_DIR.resolve(requested_dir).exists )
    {
      SHARED_DIR = SHARED_DIR.resolve(requested_dir);
    }
    else
    {
      SHARED_DIR = opera.io.filesystem.mountSystemDirectory('shared');
    }

    SHARED_DIR.refresh();

    var
      scripts = [],
      ujs_installer = false,
      sorting = getPref('sorting')||'name';

    // add link to parent directory
    if ( SHARED_DIR.parent.exists )
    {
      scripts.push
      ({
        prettyname  : '..',
        filename    : SHARED_DIR.parent.path.replace('mountpoint:/', ''),
        isdirectory : true
      });
    }

    var
      obj = null
      ,jsext = /\.js(\.xx|)$/i;
    files_arr = [];

    for ( var i = 0, file; file = SHARED_DIR[i]; i++ )
    {
      // special handling for directories
      if ( file.isDirectory )
      {
        scripts.push
        ({
          prettyname  : unescape(file.name),
          filename    : file.path.replace('mountpoint:/', ''),
          isdirectory : true
        });

        continue;
      }

      // skip if no js extension (or disabled - .xx)
      if ( !(jsext.test(file.name)) ) continue;

      files_arr.push(file.path);

      obj = ScriptsDirectory.getUserScript(file);
      scripts.push( obj );

      // check for user js installer
      if ( obj.prettyname == 'UJS Manager - script installer' )
        ujs_installer = obj;
    }

    // only top directory should get ujs installer script
    if ( istopdir )
    {
      // copy user js installer if not found or older
      var scr_installer = ScriptsDirectory.getUserScript( PUBLIC_DIR.resolve('/js/ujs_manager_installer.js') );

      if ( !ujs_installer
          || getPropOfArrayItem('version', scr_installer.header) > getPropOfArrayItem('version', ujs_installer.header)
          || getPropOfArrayItem('servicepath', ujs_installer.header) != SERVICE_PATH
          || getPropOfArrayItem('uniqueid', ujs_installer.header) != getPref('unique_id') )
      {
        // add user js installer to list because it wasn't there when reading dir
        if ( !ujs_installer )
          scripts.push( scr_installer );

        // insert current service path to ujs installer
        scr_installer.filecontent = scr_installer.filecontent.replace(
          /\{\{SERVICE_PATH\}\}/g, SERVICE_PATH);

        // generate unique id (for script installation)
        var unique_id = Math.random();
        scr_installer.filecontent = scr_installer.filecontent.replace(
          /\{\{unique_id\}\}/g, unique_id);
        savePref('unique_id', unique_id);

        writeFile('ujs_manager_installer.js', scr_installer.filecontent, true);
      }
    }

    var sort_method = (function()
    {
      switch(sorting)
      {
        case 'status':
          return function(a,b) {
            if (a.isenabled != b.isenabled)
              return (a.isenabled?-1:1);
            return (a.prettyname.toLowerCase() < b.prettyname.toLowerCase()?-1:1);
          };
        case 'name':
        default:
          return function(a,b) {
            return (a.prettyname.toLowerCase() < b.prettyname.toLowerCase()?-1:1);
          };
      }
    })();

    // sort scripts by choosen order
    scripts.sort(
      function(a, b)
      {
        // put directories on top
        if ( a.isdirectory != b.isdirectory )
          return (a.isdirectory?-1:1);
        return sort_method(a, b);
      }
    );

    return scripts;
  }

  /**
    * Creates object from user script file
    * @returns script object
    */
  this.getUserScript = function(File)
  {
    var obj = {
        prettyname  : unescape(File.name.replace(/\.xx$/i, '')),
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
      obj.header = Script.parseHeader(obj.filecontent);
      if ( obj.header )
      {
        // try to get pretty name
        obj.prettyname = getPropOfArrayItem('name', obj.header)||obj.prettyname;
      }
    }
    return obj;
  }

  this.hasChanged = function()
  {
    var is_dirty = false;
    var tmp = [];
    var jsext = /\.js(\.xx|)$/i;

    SHARED_DIR.refresh();

    for (var i=0, f; f=SHARED_DIR[i]; i++)
    {
      if (!(jsext.test(f.path))) continue;
      tmp.push(f.path);
    }

    for (var i=0, f; f=tmp[i]; i++)
    {
      if (f != files_arr[i])
      {
        is_dirty = true;
      }
    }

    files_arr = tmp;
    return is_dirty;
  }
}
DATA = { scripts: ScriptsDirectory.getAllUserScripts(null, true) };

/**
  * Update checking
  */
var Updater = new function()
{
  var latest_ver = getPref('latestVer');
  var last_check = getPref('lastCheck');

  this.checkUpdate = function(force)
  {
    // if there is saved pref with higher version then
    // don't check. we know about new version already
    if ( latest_ver && latest_ver > SERVICE_VERSION )
    {
      return true;
    }

    // get curent time (ms)
    var cur_date = new Date().getTime();

    // don't proceed if we checked for new version in last 3 days
    if ( last_check && !force )
    {
      var days_since_check = (cur_date-last_check)/(1000*60*60*24);
      if ( days_since_check < 3 ) return false;
    }

    // update last check data
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
          {
            savePref('latestVer', remoteVersion);
            return true;
          }
          else
          {
            savePref('latestVer', remoteVersion);
          }
        }
        return false;
      }
    }
    req.open('GET', SERVICE_DOAP, false);
    req.setRequestHeader('Cache-Control', 'no-cache');
    req.send();
  };

  this.remindMeLater = function()
  {
    savePref('latestVer', latest_ver=SERVICE_VERSION);
    savePref('lastCheck', last_check=new Date().getTime());
  }
}

/**
  * Utility functions
  */
function getPropOfArrayItem(prop, arr)
{
  for (var i=0; i<arr.length; i++)
  {
    if (arr[i].key==prop)
      return arr[i].value;
  }
  return null;
}

function trim(str)
{
  return str.replace(/^[\s\-]+|\s+$/, '');
}

function savePref(key, val)
{
  return widget.setPreferenceForKey(encodeURIComponent(val), key);
}

function getPref(name)
{
  return decodeURIComponent(widget.preferenceForKey(name))||null;
}

/**
  * Webserver functions
  */
var PublicFiles = new function()
{
  var files = [];

  this.share = function()
  {
    var public_dir = PUBLIC_DIR.resolve('/public_html/');
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
        files.push( path );
      }
    }
  }

  this.isPublic = function(uri)
  {
    for ( var i=0; i<files.length; i++ )
    {
      var item = files[i];
      if ( uri.indexOf(item)>-1 )
        return true;
    }
    return false;
  }
}
PublicFiles.share();


/**
  * File IO functions
  */
function readFile(f)
{
  // accepts file object or file path
  var
    Stream = null,
    str;

  if ( typeof f == 'string' )
  {
    f = SHARED_DIR.resolve(f);
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

function writeFile(path, content, can_overwrite)
{
  var File = null;

  if ( path && content && (File=SHARED_DIR.resolve(path)) )
  {
    if (File.exists && !can_overwrite)
      return false;

    var stream = SHARED_DIR.open(path, opera.io.filemode.WRITE);
    stream.write(content);
    stream.close();
    return File;
  }
  return false;
}

function createFile(path, content, overwrite)
{
  return writeFile(path, content, overwrite);
}

function deleteFile(filename)
{
  var File = null;

  if ( filename && (File=SHARED_DIR.resolve(filename))
       && File.exists && File.isFile )
  {
    return SHARED_DIR.deleteFile(File);
  }
  return false;
}

/**
  * Downloads file using synchronous XHR
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

#!/usr/bin/env python3
"""Compile production bridge code and exercise it over real cross-process DNC.
Safari dispatch and extension completion are isolated; app preferences and
notification names use temporary namespaces, never installed app state.
"""
import pathlib, subprocess, tempfile, uuid
root=pathlib.Path(__file__).resolve().parents[2]
app=(root/'App/SwarmSettings.swift').read_text().replace('SFSafariApplication.dispatchMessage(', 'BridgeNoop.dispatchMessage(').replace('let resolved = SharedContainer.defaults ?? .standard','let resolved = UserDefaults(suiteName: bridgeSuiteName)!')
native=(root/'Extension/SafariWebExtensionHandler.swift').read_text().replace('private func requestRunningApp','func requestRunningApp').replace('private func reply(','func reply(').replace('context.completeRequest(returningItems: [response], completionHandler: nil)','BridgeCapture.reply?(payload)')
footer='let bridgeSuiteName="com.Erico.SwarmBridgeTest."+UUID().uuidString\nstruct BridgeNoop {\n static func dispatchMessage(withName:String,toExtensionWithIdentifier:String,userInfo:[String:Any]?,completionHandler:@escaping(Error?)->Void){completionHandler(nil)}\n}\nenum BridgeCapture { static var reply: (([String:Any])->Void)? }\n@main struct BridgeHarness {\n static func main(){\n  if CommandLine.arguments.contains("app"){\n   let settings=SwarmSettings();settings.speed=3;settings.agents=9;settings.autoAgents=false;settings.enabled=false\n   let obs=DistributedNotificationCenter.default().addObserver(forName:Notification.Name("SwarmBridgeTest.change"),object:nil,queue:.main){_ in\n     settings.speed=1;settings.agents=7;settings.enabled=true\n   }\n   print("READY");fflush(stdout)\n   RunLoop.main.run(until:Date().addingTimeInterval(8))\n   DistributedNotificationCenter.default().removeObserver(obs)\n   UserDefaults.standard.removePersistentDomain(forName:ProcessInfo.processInfo.processName)\n   UserDefaults(suiteName:bridgeSuiteName)?.removePersistentDomain(forName:bridgeSuiteName)\n  }else{\n   let handler=SafariWebExtensionHandler();var complete=false;var failed=false\n   func read(_ changed:Bool){handler.requestRunningApp{settings in\n    guard let settings else{print("FAIL no real app response");failed=true;complete=true;return}\n    BridgeCapture.reply={p in\n     let speed=p["speed"] as? Int,agents=p["agents"] as? Int,enabled=p["enabled"] as? Bool\n     if speed != (changed ? 1:3) || agents != (changed ? 7:9) || enabled != changed {print("FAIL native full settings merge");failed=true;complete=true;return}\n     print(changed ? "PASS real cross-process App update -> native settings: speed 1, agents 7, ON" : "PASS real cross-process App settings -> native: speed 3, agents 9, OFF")\n     if changed{complete=true}else{\n      DistributedNotificationCenter.default().postNotificationName(Notification.Name("SwarmBridgeTest.change"),object:nil,userInfo:nil,deliverImmediately:true)\n      DispatchQueue.main.asyncAfter(deadline:.now()+0.15){read(true)}\n     }\n    }\n    handler.reply(["type":"settings"],context:NSExtensionContext(),appSettings:settings)\n   }}\n   read(false)\n   let end=Date().addingTimeInterval(4);while !complete && Date()<end{RunLoop.main.run(until:Date().addingTimeInterval(0.02))}\n   UserDefaults.standard.removePersistentDomain(forName:ProcessInfo.processInfo.processName)\n   if !complete || failed{exit(1)}\n  }\n }\n}\n'
namespace='com.Erico.SwarmBridgeProbe.'+uuid.uuid4().hex
for name in ['settingsRequest','settingsResponse','enabledChanged']:
 app=app.replace('com.Erico.SwarmCursors.'+name,namespace+'.'+name)
 native=native.replace('com.Erico.SwarmCursors.'+name,namespace+'.'+name)
with tempfile.TemporaryDirectory(prefix='swarm-bridge-') as temp:
 source=pathlib.Path(temp)/'Harness.swift';binary=pathlib.Path(temp)/('BridgeProbe_'+uuid.uuid4().hex)
 source.write_text(app+'\n'+native+'\nimport Darwin\n'+footer)
 subprocess.run(['swiftc','-parse-as-library',str(source),'-o',str(binary)],check=True,capture_output=True)
 process=subprocess.Popen([str(binary),'app'],stdout=subprocess.PIPE,text=True)
 try:
  assert process.stdout.readline().strip()=='READY'
  result=subprocess.run([str(binary),'native'],capture_output=True,text=True,timeout=6)
  print(result.stdout,end='')
  if result.returncode: print(result.stderr)
  assert result.returncode==0
 finally: process.wait(timeout=10)

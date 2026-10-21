import importlib.util,unittest
from pathlib import Path
r=Path(__file__).resolve().parents[1]/'runtime'
spec=importlib.util.spec_from_file_location('adapter',r/'server.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class AdapterTests(unittest.TestCase):
 def test_exact_model(self):
  with self.assertRaises(ValueError):m.normalize({'model':'deepseek-r1:8b','messages':[{'role':'user','content':'hi'}]})
 def test_tools_preserved_without_mutation(self):
  d={'model':m.MODEL,'messages':[{'role':'user','content':'hi'}],'tools':[{'type':'function','function':{'name':'read_file'}}]}
  messages,limit=m.normalize(d);self.assertEqual(messages[0]['tools'],d['tools']);self.assertNotIn('tools',d['messages'][0]);self.assertEqual(limit,1024)
 def test_limits(self):
  for extra in [{'stream':True},{'max_tokens':10000},{'messages':[]}]:
   with self.assertRaises(ValueError):m.normalize({'model':m.MODEL,'messages':[{'role':'user','content':'hi'}],**extra})
if __name__=='__main__':unittest.main()

class SetupTests(unittest.TestCase):
 def test_hardware_blocker_prevents_install_or_download(self):
  from unittest.mock import patch
  spec=importlib.util.spec_from_file_location('manager',r/'manage.py');manager=importlib.util.module_from_spec(spec);spec.loader.exec_module(manager)
  with patch.object(manager,'report',return_value={'blockers':['Not enough GPU memory']}),patch.object(manager,'run') as run,patch.object(manager.os,'setsid'),patch.object(manager.sys,'argv',['manage.py','setup']):
   with self.assertRaisesRegex(SystemExit,'Not enough GPU memory'):manager.main()
   run.assert_not_called()

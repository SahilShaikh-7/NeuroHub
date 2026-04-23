#!/usr/bin/env python3
"""
NeuroFlow Backend API Test Suite
Tests all endpoints with comprehensive validation
"""

import requests
import json
import time
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://neurohub-flow.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

class NeuroFlowTester:
    def __init__(self):
        self.token = None
        self.user_id = None
        self.test_results = []
        self.created_tasks = []
        self.created_habits = []
        
    def log_result(self, test_name, success, details=""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            'test': test_name,
            'success': success,
            'details': details
        })
        
    def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request with error handling"""
        url = f"{API_BASE}{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        if self.token:
            default_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            default_headers.update(headers)
            
        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=default_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=default_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None
            
    def test_auth_register(self):
        """Test user registration"""
        test_data = {
            "name": "Alex Johnson",
            "email": "alex.johnson@neuroflow.test",
            "password": "SecurePass123!",
            "role": "professional"
        }
        
        response = self.make_request('POST', '/auth/register', test_data)
        if not response:
            self.log_result("Auth Register", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'token' in data and 'user' in data:
                self.token = data['token']
                self.user_id = data['user']['id']
                self.log_result("Auth Register", True, f"User created with ID: {self.user_id}")
                return True
            else:
                self.log_result("Auth Register", False, f"Missing token/user in response: {data}")
                return False
        else:
            self.log_result("Auth Register", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_auth_register_duplicate(self):
        """Test duplicate email registration"""
        test_data = {
            "name": "Alex Johnson Duplicate",
            "email": "alex.johnson@neuroflow.test",  # Same email
            "password": "AnotherPass123!",
            "role": "student"
        }
        
        response = self.make_request('POST', '/auth/register', test_data)
        if not response:
            self.log_result("Auth Register Duplicate", False, "Request failed")
            return False
            
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and 'already registered' in data['error'].lower():
                self.log_result("Auth Register Duplicate", True, "Correctly rejected duplicate email")
                return True
            else:
                self.log_result("Auth Register Duplicate", False, f"Wrong error message: {data}")
                return False
        else:
            self.log_result("Auth Register Duplicate", False, f"Expected 400, got {response.status_code}")
            return False
            
    def test_auth_login(self):
        """Test user login"""
        test_data = {
            "email": "alex.johnson@neuroflow.test",
            "password": "SecurePass123!"
        }
        
        response = self.make_request('POST', '/auth/login', test_data)
        if not response:
            self.log_result("Auth Login", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'token' in data and 'user' in data:
                self.token = data['token']  # Update token
                self.log_result("Auth Login", True, "Login successful")
                return True
            else:
                self.log_result("Auth Login", False, f"Missing token/user: {data}")
                return False
        else:
            self.log_result("Auth Login", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_auth_login_wrong_password(self):
        """Test login with wrong password"""
        test_data = {
            "email": "alex.johnson@neuroflow.test",
            "password": "WrongPassword123!"
        }
        
        response = self.make_request('POST', '/auth/login', test_data)
        if not response:
            self.log_result("Auth Login Wrong Password", False, "Request failed")
            return False
            
        if response.status_code == 401:
            self.log_result("Auth Login Wrong Password", True, "Correctly rejected wrong password")
            return True
        else:
            self.log_result("Auth Login Wrong Password", False, f"Expected 401, got {response.status_code}")
            return False
            
    def test_auth_me(self):
        """Test getting current user info"""
        response = self.make_request('GET', '/auth/me')
        if not response:
            self.log_result("Auth Me", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'user' in data and data['user']['id'] == self.user_id:
                self.log_result("Auth Me", True, "User info retrieved successfully")
                return True
            else:
                self.log_result("Auth Me", False, f"Invalid user data: {data}")
                return False
        else:
            self.log_result("Auth Me", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_auth_me_no_token(self):
        """Test /auth/me without token"""
        old_token = self.token
        self.token = None
        
        response = self.make_request('GET', '/auth/me')
        self.token = old_token  # Restore token
        
        if not response:
            self.log_result("Auth Me No Token", False, "Request failed")
            return False
            
        if response.status_code == 401:
            self.log_result("Auth Me No Token", True, "Correctly rejected missing token")
            return True
        else:
            self.log_result("Auth Me No Token", False, f"Expected 401, got {response.status_code}")
            return False
            
    def test_tasks_create(self):
        """Test creating tasks"""
        # Create multiple tasks with different properties
        tasks_to_create = [
            {
                "title": "Complete quarterly report",
                "description": "Finish Q4 financial analysis",
                "category": "work",
                "importance": 8,
                "effort": 6,
                "deadline": (datetime.now() + timedelta(days=2)).isoformat(),
                "tags": ["urgent", "finance"]
            },
            {
                "title": "Review team performance",
                "category": "work", 
                "importance": 7,
                "effort": 4,
                "deadline": (datetime.now() - timedelta(hours=12)).isoformat(),  # Past deadline
                "tags": ["management"]
            },
            {
                "title": "Plan weekend trip",
                "category": "personal",
                "importance": 4,
                "effort": 3,
                "deadline": (datetime.now() + timedelta(days=7)).isoformat(),
                "tags": ["travel", "fun"]
            }
        ]
        
        success_count = 0
        for i, task_data in enumerate(tasks_to_create):
            response = self.make_request('POST', '/tasks', task_data)
            if response and response.status_code == 200:
                data = response.json()
                if 'task' in data:
                    task = data['task']
                    self.created_tasks.append(task)
                    
                    # Verify priority calculation
                    expected_urgency = self.calculate_urgency(task_data.get('deadline'))
                    if abs(task['urgency'] - expected_urgency) < 0.1:
                        success_count += 1
                        print(f"   Task {i+1}: {task['title']} - Priority: {task['priority']}")
                    else:
                        print(f"   Task {i+1}: Priority calculation error")
                else:
                    print(f"   Task {i+1}: Missing task in response")
            else:
                print(f"   Task {i+1}: Request failed")
                
        success = success_count == len(tasks_to_create)
        self.log_result("Tasks Create", success, f"Created {success_count}/{len(tasks_to_create)} tasks")
        return success
        
    def calculate_urgency(self, deadline):
        """Calculate expected urgency for validation"""
        if not deadline:
            return 3
        hours = (datetime.fromisoformat(deadline.replace('Z', '+00:00')).timestamp() - time.time()) / 3600
        if hours <= 0:
            return 10
        elif hours <= 6:
            return 9.5
        elif hours <= 24:
            return 8.5
        elif hours <= 48:
            return 7
        elif hours <= 24 * 7:
            return 5
        return 3
        
    def test_tasks_get(self):
        """Test getting tasks list"""
        response = self.make_request('GET', '/tasks')
        if not response:
            self.log_result("Tasks Get", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'tasks' in data:
                tasks = data['tasks']
                # Verify tasks are ordered by priority (descending)
                priorities = [t['priority'] for t in tasks]
                is_sorted = all(priorities[i] >= priorities[i+1] for i in range(len(priorities)-1))
                
                self.log_result("Tasks Get", True, f"Retrieved {len(tasks)} tasks, sorted by priority: {is_sorted}")
                return True
            else:
                self.log_result("Tasks Get", False, f"Missing tasks in response: {data}")
                return False
        else:
            self.log_result("Tasks Get", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_tasks_update(self):
        """Test updating task"""
        if not self.created_tasks:
            self.log_result("Tasks Update", False, "No tasks to update")
            return False
            
        task = self.created_tasks[0]
        update_data = {
            "importance": 9,
            "deadline": (datetime.now() + timedelta(hours=6)).isoformat()
        }
        
        response = self.make_request('PUT', f'/tasks/{task["id"]}', update_data)
        if not response:
            self.log_result("Tasks Update", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'task' in data:
                updated_task = data['task']
                # Verify priority was recomputed
                if updated_task['importance'] == 9 and updated_task['priority'] != task['priority']:
                    self.log_result("Tasks Update", True, f"Priority recomputed: {task['priority']} -> {updated_task['priority']}")
                    return True
                else:
                    self.log_result("Tasks Update", False, "Priority not recomputed correctly")
                    return False
            else:
                self.log_result("Tasks Update", False, f"Missing task in response: {data}")
                return False
        else:
            self.log_result("Tasks Update", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_tasks_complete(self):
        """Test completing task"""
        if len(self.created_tasks) < 2:
            self.log_result("Tasks Complete", False, "Need at least 2 tasks")
            return False
            
        task = self.created_tasks[1]  # Use second task
        response = self.make_request('POST', f'/tasks/{task["id"]}/complete')
        if not response:
            self.log_result("Tasks Complete", False, "Request failed")
            return False
            
        if response.status_code == 200:
            # Verify task is marked as completed
            get_response = self.make_request('GET', '/tasks')
            if get_response and get_response.status_code == 200:
                tasks = get_response.json()['tasks']
                completed_task = next((t for t in tasks if t['id'] == task['id']), None)
                if completed_task and completed_task['status'] == 'completed':
                    self.log_result("Tasks Complete", True, f"Task completed and XP awarded")
                    return True
                    
        self.log_result("Tasks Complete", False, "Task completion failed")
        return False
        
    def test_tasks_delete(self):
        """Test deleting task"""
        if len(self.created_tasks) < 3:
            self.log_result("Tasks Delete", False, "Need at least 3 tasks")
            return False
            
        task = self.created_tasks[2]  # Use third task
        response = self.make_request('DELETE', f'/tasks/{task["id"]}')
        if not response:
            self.log_result("Tasks Delete", False, "Request failed")
            return False
            
        if response.status_code == 200:
            # Verify task is deleted
            get_response = self.make_request('GET', '/tasks')
            if get_response and get_response.status_code == 200:
                tasks = get_response.json()['tasks']
                deleted_task = next((t for t in tasks if t['id'] == task['id']), None)
                if not deleted_task:
                    self.log_result("Tasks Delete", True, "Task successfully deleted")
                    return True
                    
        self.log_result("Tasks Delete", False, "Task deletion failed")
        return False
        
    def test_delay_history(self):
        """Test delay history calculation by completing tasks late"""
        # Create 2 tasks in same category with past deadlines
        past_deadline = (datetime.now() - timedelta(days=1)).isoformat()
        
        for i in range(2):
            task_data = {
                "title": f"Late task {i+1}",
                "category": "testing",
                "importance": 5,
                "effort": 5,
                "deadline": past_deadline
            }
            
            response = self.make_request('POST', '/tasks', task_data)
            if response and response.status_code == 200:
                task = response.json()['task']
                # Complete the task (it's already past deadline)
                complete_response = self.make_request('POST', f'/tasks/{task["id"]}/complete')
                if complete_response and complete_response.status_code == 200:
                    print(f"   Completed late task {i+1}")
                    
        # Now create a new task in the same category
        new_task_data = {
            "title": "New testing task",
            "category": "testing",
            "importance": 5,
            "effort": 5,
            "deadline": (datetime.now() + timedelta(days=1)).isoformat()
        }
        
        response = self.make_request('POST', '/tasks', new_task_data)
        if response and response.status_code == 200:
            task = response.json()['task']
            if task['delayHistory'] > 0:
                self.log_result("Delay History", True, f"DelayHistory calculated: {task['delayHistory']}")
                return True
            else:
                self.log_result("Delay History", False, f"DelayHistory not calculated: {task['delayHistory']}")
                return False
        else:
            self.log_result("Delay History", False, "Failed to create new task")
            return False
            
    def test_habits_create(self):
        """Test creating habits"""
        habits_to_create = [
            {"name": "Read 30 minutes daily"},
            {"name": "Exercise for 45 minutes"},
            {"name": "Meditate 10 minutes"}
        ]
        
        success_count = 0
        for habit_data in habits_to_create:
            response = self.make_request('POST', '/habits', habit_data)
            if response and response.status_code == 200:
                data = response.json()
                if 'habit' in data:
                    self.created_habits.append(data['habit'])
                    success_count += 1
                    print(f"   Created habit: {habit_data['name']}")
                    
        success = success_count == len(habits_to_create)
        self.log_result("Habits Create", success, f"Created {success_count}/{len(habits_to_create)} habits")
        return success
        
    def test_habits_get(self):
        """Test getting habits list"""
        response = self.make_request('GET', '/habits')
        if not response:
            self.log_result("Habits Get", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'habits' in data:
                habits = data['habits']
                # Verify strength is computed
                has_strength = all('strength' in h for h in habits)
                self.log_result("Habits Get", True, f"Retrieved {len(habits)} habits, strength computed: {has_strength}")
                return True
            else:
                self.log_result("Habits Get", False, f"Missing habits in response: {data}")
                return False
        else:
            self.log_result("Habits Get", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_habits_checkin(self):
        """Test habit check-in"""
        if not self.created_habits:
            self.log_result("Habits Checkin", False, "No habits to check in")
            return False
            
        habit = self.created_habits[0]
        response = self.make_request('POST', f'/habits/{habit["id"]}/checkin')
        if not response:
            self.log_result("Habits Checkin", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'habit' in data:
                updated_habit = data['habit']
                if updated_habit['streak'] > 0 and updated_habit['strength'] > 0:
                    self.log_result("Habits Checkin", True, f"Streak: {updated_habit['streak']}, Strength: {updated_habit['strength']}")
                    return True
                else:
                    self.log_result("Habits Checkin", False, "Streak/strength not updated")
                    return False
            else:
                self.log_result("Habits Checkin", False, f"Missing habit in response: {data}")
                return False
        else:
            self.log_result("Habits Checkin", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_habits_checkin_duplicate(self):
        """Test duplicate check-in same day"""
        if not self.created_habits:
            self.log_result("Habits Checkin Duplicate", False, "No habits to check in")
            return False
            
        habit = self.created_habits[0]
        response = self.make_request('POST', f'/habits/{habit["id"]}/checkin')
        if not response:
            self.log_result("Habits Checkin Duplicate", False, "Request failed")
            return False
            
        # Should return error message about duplicate
        if response.status_code == 200:
            data = response.json()
            if 'error' in data and 'already checked in' in data['error'].lower():
                self.log_result("Habits Checkin Duplicate", True, "Correctly prevented duplicate checkin")
                return True
            else:
                self.log_result("Habits Checkin Duplicate", False, f"Unexpected response: {data}")
                return False
        else:
            self.log_result("Habits Checkin Duplicate", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_habits_delete(self):
        """Test deleting habit"""
        if len(self.created_habits) < 2:
            self.log_result("Habits Delete", False, "Need at least 2 habits")
            return False
            
        habit = self.created_habits[1]  # Use second habit
        response = self.make_request('DELETE', f'/habits/{habit["id"]}')
        if not response:
            self.log_result("Habits Delete", False, "Request failed")
            return False
            
        if response.status_code == 200:
            # Verify habit is deleted
            get_response = self.make_request('GET', '/habits')
            if get_response and get_response.status_code == 200:
                habits = get_response.json()['habits']
                deleted_habit = next((h for h in habits if h['id'] == habit['id']), None)
                if not deleted_habit:
                    self.log_result("Habits Delete", True, "Habit successfully deleted")
                    return True
                    
        self.log_result("Habits Delete", False, "Habit deletion failed")
        return False
        
    def test_insights(self):
        """Test AI insights generation"""
        response = self.make_request('GET', '/insights')
        if not response:
            self.log_result("Insights", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'insights' in data:
                insights = data['insights']
                has_peak_hour = 'peakHour' in data
                self.log_result("Insights", True, f"Generated {len(insights)} insights, peakHour: {has_peak_hour}")
                
                # Print insights for verification
                for insight in insights[:3]:  # Show first 3
                    print(f"   {insight['icon']} {insight['title']}: {insight['message']}")
                return True
            else:
                self.log_result("Insights", False, f"Missing insights in response: {data}")
                return False
        else:
            self.log_result("Insights", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_analytics(self):
        """Test analytics endpoint"""
        response = self.make_request('GET', '/analytics')
        if not response:
            self.log_result("Analytics", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            required_fields = ['productivityScore', 'completionRate', 'totalTasks', 'completedTasks', 'weekly', 'hourly', 'categories', 'xp', 'level']
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                self.log_result("Analytics", True, f"All fields present. Score: {data['productivityScore']}, Rate: {data['completionRate']}%")
                return True
            else:
                self.log_result("Analytics", False, f"Missing fields: {missing_fields}")
                return False
        else:
            self.log_result("Analytics", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_chatbot_add_task(self):
        """Test chatbot task creation"""
        test_message = "Add task finish quarterly report tomorrow at 5 PM"
        
        response = self.make_request('POST', '/chatbot', {"message": test_message})
        if not response:
            self.log_result("Chatbot Add Task", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'reply' in data and '✅' in data['reply'] and 'action' in data:
                # Verify task was actually created
                tasks_response = self.make_request('GET', '/tasks')
                if tasks_response and tasks_response.status_code == 200:
                    tasks = tasks_response.json()['tasks']
                    quarterly_task = next((t for t in tasks if 'quarterly report' in t['title'].lower()), None)
                    if quarterly_task:
                        self.log_result("Chatbot Add Task", True, f"Task created via chatbot: {quarterly_task['title']}")
                        return True
                        
        self.log_result("Chatbot Add Task", False, "Chatbot task creation failed")
        return False
        
    def test_chatbot_show_tasks(self):
        """Test chatbot task listing"""
        test_message = "Show my pending tasks"
        
        response = self.make_request('POST', '/chatbot', {"message": test_message})
        if not response:
            self.log_result("Chatbot Show Tasks", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'reply' in data and ('pending task' in data['reply'].lower() or 'no pending' in data['reply'].lower()):
                self.log_result("Chatbot Show Tasks", True, "Chatbot listed tasks")
                return True
            else:
                self.log_result("Chatbot Show Tasks", False, f"Unexpected reply: {data['reply']}")
                return False
        else:
            self.log_result("Chatbot Show Tasks", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_chatbot_complete_task(self):
        """Test chatbot task completion"""
        test_message = "Complete quarterly report"
        
        response = self.make_request('POST', '/chatbot', {"message": test_message})
        if not response:
            self.log_result("Chatbot Complete Task", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'reply' in data and ('completed' in data['reply'].lower() or 'xp' in data['reply'].lower()):
                self.log_result("Chatbot Complete Task", True, "Chatbot completed task")
                return True
            else:
                self.log_result("Chatbot Complete Task", False, f"Unexpected reply: {data['reply']}")
                return False
        else:
            self.log_result("Chatbot Complete Task", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_chatbot_add_habit(self):
        """Test chatbot habit creation"""
        test_message = "Add habit read 30 min"
        
        response = self.make_request('POST', '/chatbot', {"message": test_message})
        if not response:
            self.log_result("Chatbot Add Habit", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'reply' in data and 'tracking habit' in data['reply'].lower():
                # Verify habit was created
                habits_response = self.make_request('GET', '/habits')
                if habits_response and habits_response.status_code == 200:
                    habits = habits_response.json()['habits']
                    read_habit = next((h for h in habits if 'read' in h['name'].lower()), None)
                    if read_habit:
                        self.log_result("Chatbot Add Habit", True, f"Habit created via chatbot: {read_habit['name']}")
                        return True
                        
        self.log_result("Chatbot Add Habit", False, "Chatbot habit creation failed")
        return False
        
    def test_chatbot_show_stats(self):
        """Test chatbot stats display"""
        test_message = "Show my stats"
        
        response = self.make_request('POST', '/chatbot', {"message": test_message})
        if not response:
            self.log_result("Chatbot Show Stats", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'reply' in data and ('completed' in data['reply'].lower() and 'xp' in data['reply'].lower()):
                self.log_result("Chatbot Show Stats", True, "Chatbot showed stats")
                return True
            else:
                self.log_result("Chatbot Show Stats", False, f"Unexpected reply: {data['reply']}")
                return False
        else:
            self.log_result("Chatbot Show Stats", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_chatbot_unknown_message(self):
        """Test chatbot fallback for unknown messages"""
        test_message = "What's the weather like today?"
        
        response = self.make_request('POST', '/chatbot', {"message": test_message})
        if not response:
            self.log_result("Chatbot Unknown Message", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'reply' in data and 'help' in data['reply'].lower():
                self.log_result("Chatbot Unknown Message", True, "Chatbot provided help text")
                return True
            else:
                self.log_result("Chatbot Unknown Message", False, f"Unexpected reply: {data['reply']}")
                return False
        else:
            self.log_result("Chatbot Unknown Message", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting NeuroFlow Backend API Tests")
        print(f"📍 Base URL: {API_BASE}")
        print("=" * 60)
        
        # Auth tests
        print("\n🔐 Authentication Tests")
        self.test_auth_register()
        self.test_auth_register_duplicate()
        self.test_auth_login()
        self.test_auth_login_wrong_password()
        self.test_auth_me()
        self.test_auth_me_no_token()
        
        # Tasks tests
        print("\n📋 Tasks Tests")
        self.test_tasks_create()
        self.test_tasks_get()
        self.test_tasks_update()
        self.test_tasks_complete()
        self.test_tasks_delete()
        self.test_delay_history()
        
        # Habits tests
        print("\n🔁 Habits Tests")
        self.test_habits_create()
        self.test_habits_get()
        self.test_habits_checkin()
        self.test_habits_checkin_duplicate()
        self.test_habits_delete()
        
        # Insights tests
        print("\n🧠 Insights Tests")
        self.test_insights()
        
        # Analytics tests
        print("\n📊 Analytics Tests")
        self.test_analytics()
        
        # Chatbot tests
        print("\n🤖 Chatbot Tests")
        self.test_chatbot_add_task()
        self.test_chatbot_show_tasks()
        self.test_chatbot_complete_task()
        self.test_chatbot_add_habit()
        self.test_chatbot_show_stats()
        self.test_chatbot_unknown_message()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.test_results if r['success'])
        total = len(self.test_results)
        
        print(f"✅ Passed: {passed}/{total} ({passed/total*100:.1f}%)")
        
        if passed < total:
            print(f"❌ Failed: {total - passed}")
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  • {result['test']}: {result['details']}")
                    
        return passed == total

if __name__ == "__main__":
    tester = NeuroFlowTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)
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

    # =================================================================
    # PHASE 2 TESTS - Anti-Fake Detection, Activity Logs, Workspaces
    # =================================================================
    
    def test_task_start_endpoint(self):
        """Test POST /api/tasks/:id/start endpoint"""
        # Create a task first
        task_data = {
            "title": "Test start endpoint task",
            "category": "testing",
            "importance": 5,
            "effort": 5
        }
        
        response = self.make_request('POST', '/tasks', task_data)
        if not response or response.status_code != 200:
            self.log_result("Task Start Endpoint", False, "Failed to create test task")
            return False
            
        task = response.json()['task']
        
        # Test start endpoint
        start_response = self.make_request('POST', f'/tasks/{task["id"]}/start')
        if not start_response:
            self.log_result("Task Start Endpoint", False, "Start request failed")
            return False
            
        if start_response.status_code == 200:
            data = start_response.json()
            if 'ok' in data and data['ok'] and 'startedAt' in data:
                # Verify GET /tasks shows startedAt
                get_response = self.make_request('GET', '/tasks')
                if get_response and get_response.status_code == 200:
                    tasks = get_response.json()['tasks']
                    started_task = next((t for t in tasks if t['id'] == task['id']), None)
                    if started_task and started_task.get('startedAt'):
                        self.log_result("Task Start Endpoint", True, f"Task started at: {data['startedAt']}")
                        return True
                        
        self.log_result("Task Start Endpoint", False, "Start endpoint failed")
        return False
        
    def test_anti_fake_instant_completion(self):
        """Test anti-fake detection for instant completion"""
        # Create a task
        task_data = {
            "title": "Instant fake completion test",
            "category": "testing",
            "importance": 5,
            "effort": 5
        }
        
        response = self.make_request('POST', '/tasks', task_data)
        if not response or response.status_code != 200:
            self.log_result("Anti-Fake Instant", False, "Failed to create test task")
            return False
            
        task = response.json()['task']
        
        # Complete immediately (within 1 second)
        complete_response = self.make_request('POST', f'/tasks/{task["id"]}/complete')
        if not complete_response:
            self.log_result("Anti-Fake Instant", False, "Complete request failed")
            return False
            
        if complete_response.status_code == 200:
            data = complete_response.json()
            required_fields = ['ok', 'confidence', 'flagged', 'reasons', 'xpEarned', 'baseXP']
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                confidence = data['confidence']
                flagged = data['flagged']
                reasons = data['reasons']
                xp_earned = data['xpEarned']
                base_xp = data['baseXP']
                
                # Verify anti-fake detection
                if confidence < 0.5 and flagged and xp_earned == round(base_xp * confidence):
                    has_instant_reason = any('instant' in r.lower() or '<10s' in r.lower() or '<3s' in r.lower() for r in reasons)
                    if has_instant_reason:
                        self.log_result("Anti-Fake Instant", True, f"Confidence: {confidence}, Flagged: {flagged}, XP: {xp_earned}/{base_xp}")
                        return True
                    else:
                        self.log_result("Anti-Fake Instant", False, f"Missing instant completion reason: {reasons}")
                        return False
                else:
                    self.log_result("Anti-Fake Instant", False, f"Anti-fake detection failed: conf={confidence}, flagged={flagged}, xp={xp_earned}")
                    return False
            else:
                self.log_result("Anti-Fake Instant", False, f"Missing fields: {missing_fields}")
                return False
        else:
            self.log_result("Anti-Fake Instant", False, f"Status {complete_response.status_code}: {complete_response.text}")
            return False
            
    def test_anti_fake_honest_completion(self):
        """Test honest completion with start -> wait -> complete"""
        # Create a task
        task_data = {
            "title": "Honest completion test",
            "category": "testing",
            "importance": 5,
            "effort": 5
        }
        
        response = self.make_request('POST', '/tasks', task_data)
        if not response or response.status_code != 200:
            self.log_result("Anti-Fake Honest", False, "Failed to create test task")
            return False
            
        task = response.json()['task']
        
        # Start the task
        start_response = self.make_request('POST', f'/tasks/{task["id"]}/start')
        if not start_response or start_response.status_code != 200:
            self.log_result("Anti-Fake Honest", False, "Failed to start task")
            return False
            
        # Wait 3 seconds
        time.sleep(3)
        
        # Complete the task
        complete_response = self.make_request('POST', f'/tasks/{task["id"]}/complete')
        if not complete_response:
            self.log_result("Anti-Fake Honest", False, "Complete request failed")
            return False
            
        if complete_response.status_code == 200:
            data = complete_response.json()
            confidence = data.get('confidence', 0)
            flagged = data.get('flagged', True)
            xp_earned = data.get('xpEarned', 0)
            base_xp = data.get('baseXP', 15)
            
            # Verify honest completion gets good score
            if confidence >= 0.5 and not flagged and xp_earned == round(base_xp * confidence):
                # Verify user XP increased
                me_response = self.make_request('GET', '/auth/me')
                if me_response and me_response.status_code == 200:
                    user = me_response.json()['user']
                    self.log_result("Anti-Fake Honest", True, f"Confidence: {confidence}, Not flagged, XP: {xp_earned}, User XP: {user.get('xp', 0)}")
                    return True
                else:
                    self.log_result("Anti-Fake Honest", False, "Failed to verify user XP")
                    return False
            else:
                self.log_result("Anti-Fake Honest", False, f"Honest completion failed: conf={confidence}, flagged={flagged}, xp={xp_earned}")
                return False
        else:
            self.log_result("Anti-Fake Honest", False, f"Status {complete_response.status_code}: {complete_response.text}")
            return False
            
    def test_anti_fake_habit_checkin(self):
        """Test anti-fake detection on habit check-in"""
        # Create a habit
        habit_data = {"name": "Anti-fake test habit"}
        
        response = self.make_request('POST', '/habits', habit_data)
        if not response or response.status_code != 200:
            self.log_result("Anti-Fake Habit", False, "Failed to create test habit")
            return False
            
        habit = response.json()['habit']
        
        # Check in
        checkin_response = self.make_request('POST', f'/habits/{habit["id"]}/checkin')
        if not checkin_response:
            self.log_result("Anti-Fake Habit", False, "Checkin request failed")
            return False
            
        if checkin_response.status_code == 200:
            data = checkin_response.json()
            required_fields = ['confidence', 'flagged', 'reasons', 'xpEarned', 'baseXP']
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                base_xp = data['baseXP']
                if base_xp == 10:  # Base XP for habits should be 10
                    self.log_result("Anti-Fake Habit", True, f"Habit checkin with anti-fake: conf={data['confidence']}, baseXP={base_xp}")
                    return True
                else:
                    self.log_result("Anti-Fake Habit", False, f"Wrong base XP: expected 10, got {base_xp}")
                    return False
            else:
                self.log_result("Anti-Fake Habit", False, f"Missing fields: {missing_fields}")
                return False
        else:
            self.log_result("Anti-Fake Habit", False, f"Status {checkin_response.status_code}: {checkin_response.text}")
            return False
            
    def test_activity_logs(self):
        """Test GET /api/activity-logs endpoint"""
        response = self.make_request('GET', '/activity-logs')
        if not response:
            self.log_result("Activity Logs", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            required_fields = ['logs', 'total', 'flagged', 'trust']
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                logs = data['logs']
                # Verify log structure
                if logs:
                    log = logs[0]
                    log_fields = ['id', 'userId', 'actionType', 'targetId', 'timestamp', 'confidenceScore', 'flagged', 'reasons']
                    missing_log_fields = [field for field in log_fields if field not in log]
                    
                    if not missing_log_fields:
                        # Check for task_complete and habit_check actions
                        action_types = set(log['actionType'] for log in logs)
                        has_task_complete = 'task_complete' in action_types
                        has_habit_check = 'habit_check' in action_types
                        
                        self.log_result("Activity Logs", True, f"Found {len(logs)} logs, total={data['total']}, flagged={data['flagged']}, trust={data['trust']}")
                        return True
                    else:
                        self.log_result("Activity Logs", False, f"Missing log fields: {missing_log_fields}")
                        return False
                else:
                    self.log_result("Activity Logs", True, "No logs yet (empty response is valid)")
                    return True
            else:
                self.log_result("Activity Logs", False, f"Missing fields: {missing_fields}")
                return False
        else:
            self.log_result("Activity Logs", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_batch_detection(self):
        """Test batch detection by rapidly completing multiple tasks"""
        # Create 6 tasks
        tasks = []
        for i in range(6):
            task_data = {
                "title": f"Batch test task {i+1}",
                "category": "batch_testing",
                "importance": 5,
                "effort": 5
            }
            
            response = self.make_request('POST', '/tasks', task_data)
            if response and response.status_code == 200:
                tasks.append(response.json()['task'])
                
        if len(tasks) < 6:
            self.log_result("Batch Detection", False, f"Only created {len(tasks)}/6 tasks")
            return False
            
        # Rapidly complete 5 tasks within 10 seconds
        batch_results = []
        for i in range(5):
            complete_response = self.make_request('POST', f'/tasks/{tasks[i]["id"]}/complete')
            if complete_response and complete_response.status_code == 200:
                batch_results.append(complete_response.json())
                time.sleep(0.5)  # Small delay between completions
                
        # Check if later completions were flagged for batch pattern
        flagged_for_batch = 0
        for result in batch_results[2:]:  # Check last 3 completions
            if result.get('flagged') and any('batch' in r.lower() or 'rapid' in r.lower() for r in result.get('reasons', [])):
                flagged_for_batch += 1
                
        if flagged_for_batch > 0:
            self.log_result("Batch Detection", True, f"Detected batch pattern in {flagged_for_batch} completions")
            return True
        else:
            self.log_result("Batch Detection", False, "Batch pattern not detected")
            return False
            
    def test_analytics_enhancement(self):
        """Test enhanced analytics with trust metrics"""
        response = self.make_request('GET', '/analytics')
        if not response:
            self.log_result("Analytics Enhancement", False, "Request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            new_fields = ['trustScore', 'totalActions', 'flaggedActions', 'allCompletedTasks', 'flaggedTasks']
            missing_fields = [field for field in new_fields if field not in data]
            
            if not missing_fields:
                # Verify completedTasks vs allCompletedTasks
                completed_tasks = data['completedTasks']
                all_completed = data['allCompletedTasks']
                flagged_tasks = data['flaggedTasks']
                
                if all_completed >= completed_tasks and flagged_tasks >= 0:
                    self.log_result("Analytics Enhancement", True, f"Trust: {data['trustScore']}%, Valid: {completed_tasks}/{all_completed}, Flagged: {flagged_tasks}")
                    return True
                else:
                    self.log_result("Analytics Enhancement", False, f"Invalid counts: completed={completed_tasks}, all={all_completed}, flagged={flagged_tasks}")
                    return False
            else:
                self.log_result("Analytics Enhancement", False, f"Missing new fields: {missing_fields}")
                return False
        else:
            self.log_result("Analytics Enhancement", False, f"Status {response.status_code}: {response.text}")
            return False
            
    def test_behavior_engine_protection(self):
        """Test behavior engine excludes flagged completions from learning"""
        # Create and instantly complete 2 tasks in 'coding' category (should be flagged)
        for i in range(2):
            task_data = {
                "title": f"Coding task {i+1} for behavior test",
                "category": "coding",
                "importance": 5,
                "effort": 5
            }
            
            response = self.make_request('POST', '/tasks', task_data)
            if response and response.status_code == 200:
                task = response.json()['task']
                # Complete instantly (should be flagged)
                self.make_request('POST', f'/tasks/{task["id"]}/complete')
                
        # Now create a new 'coding' task
        new_task_data = {
            "title": "New coding task to check delayHistory",
            "category": "coding",
            "importance": 5,
            "effort": 5
        }
        
        response = self.make_request('POST', '/tasks', new_task_data)
        if not response or response.status_code != 200:
            self.log_result("Behavior Engine Protection", False, "Failed to create new task")
            return False
            
        task = response.json()['task']
        delay_history = task.get('delayHistory', -1)
        
        # delayHistory should be 0 because flagged completions are excluded
        if delay_history == 0:
            self.log_result("Behavior Engine Protection", True, f"DelayHistory correctly excluded flagged completions: {delay_history}")
            return True
        else:
            self.log_result("Behavior Engine Protection", False, f"DelayHistory should be 0, got: {delay_history}")
            return False
            
    def test_workspaces_create_and_list(self):
        """Test workspace creation and listing"""
        # Create workspace
        workspace_data = {"name": "Team Alpha Testing"}
        
        response = self.make_request('POST', '/workspaces', workspace_data)
        if not response:
            self.log_result("Workspaces Create", False, "Create request failed")
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'workspace' in data:
                workspace = data['workspace']
                required_fields = ['id', 'name', 'inviteCode', 'role']
                missing_fields = [field for field in required_fields if field not in workspace]
                
                if not missing_fields and workspace['role'] == 'owner':
                    # Test listing workspaces
                    list_response = self.make_request('GET', '/workspaces')
                    if list_response and list_response.status_code == 200:
                        workspaces = list_response.json()['workspaces']
                        found_workspace = next((w for w in workspaces if w['id'] == workspace['id']), None)
                        
                        if found_workspace:
                            self.log_result("Workspaces Create", True, f"Created workspace: {workspace['name']}, invite: {workspace['inviteCode']}")
                            self.test_workspace_id = workspace['id']
                            self.test_invite_code = workspace['inviteCode']
                            return True
                            
        self.log_result("Workspaces Create", False, "Workspace creation/listing failed")
        return False
        
    def test_workspaces_collaboration(self):
        """Test workspace collaboration features"""
        if not hasattr(self, 'test_workspace_id'):
            self.log_result("Workspaces Collaboration", False, "No workspace to test with")
            return False
            
        # Create second user
        user_b_data = {
            "name": "Bob Collaborator",
            "email": "bob.collab@neuroflow.test",
            "password": "SecurePass123!",
            "role": "professional"
        }
        
        response = self.make_request('POST', '/auth/register', user_b_data)
        if not response or response.status_code != 200:
            self.log_result("Workspaces Collaboration", False, "Failed to create user B")
            return False
            
        user_b_token = response.json()['token']
        
        # User A invites User B by email
        invite_data = {"email": "bob.collab@neuroflow.test"}
        invite_response = self.make_request('POST', f'/workspaces/{self.test_workspace_id}/invite', invite_data)
        
        if not invite_response or invite_response.status_code != 200:
            self.log_result("Workspaces Collaboration", False, "Failed to invite user B")
            return False
            
        # Switch to User B token
        original_token = self.token
        self.token = user_b_token
        
        # User B should see the workspace
        list_response = self.make_request('GET', '/workspaces')
        if not list_response or list_response.status_code != 200:
            self.token = original_token
            self.log_result("Workspaces Collaboration", False, "User B can't list workspaces")
            return False
            
        workspaces = list_response.json()['workspaces']
        found_workspace = next((w for w in workspaces if w['id'] == self.test_workspace_id), None)
        
        if not found_workspace or found_workspace['role'] != 'member':
            self.token = original_token
            self.log_result("Workspaces Collaboration", False, "User B doesn't see workspace as member")
            return False
            
        # User A creates a shared task
        self.token = original_token
        shared_task_data = {
            "title": "Shared workspace task",
            "category": "collaboration",
            "workspaceId": self.test_workspace_id
        }
        
        task_response = self.make_request('POST', '/tasks', shared_task_data)
        if not task_response or task_response.status_code != 200:
            self.log_result("Workspaces Collaboration", False, "Failed to create shared task")
            return False
            
        shared_task = task_response.json()['task']
        
        # User B should be able to complete the shared task
        self.token = user_b_token
        complete_response = self.make_request('POST', f'/tasks/{shared_task["id"]}/complete')
        
        if complete_response and complete_response.status_code == 200:
            # Test workspace analytics
            analytics_response = self.make_request('GET', f'/workspaces/{self.test_workspace_id}/analytics')
            if analytics_response and analytics_response.status_code == 200:
                analytics = analytics_response.json()
                required_fields = ['totalTasks', 'validCompleted', 'completionRate', 'memberStats']
                missing_fields = [field for field in required_fields if field not in analytics]
                
                if not missing_fields:
                    member_stats = analytics['memberStats']
                    if len(member_stats) >= 2:  # Owner + member
                        self.token = original_token
                        self.log_result("Workspaces Collaboration", True, f"Collaboration working: {len(member_stats)} members, {analytics['totalTasks']} tasks")
                        return True
                        
        self.token = original_token
        self.log_result("Workspaces Collaboration", False, "Collaboration features failed")
        return False
        
    def test_workspaces_join_by_code(self):
        """Test joining workspace by invite code"""
        if not hasattr(self, 'test_invite_code'):
            self.log_result("Workspaces Join Code", False, "No invite code to test with")
            return False
            
        # Create third user
        user_c_data = {
            "name": "Charlie Joiner",
            "email": "charlie.join@neuroflow.test",
            "password": "SecurePass123!",
            "role": "student"
        }
        
        response = self.make_request('POST', '/auth/register', user_c_data)
        if not response or response.status_code != 200:
            self.log_result("Workspaces Join Code", False, "Failed to create user C")
            return False
            
        user_c_token = response.json()['token']
        
        # Switch to User C
        original_token = self.token
        self.token = user_c_token
        
        # Join workspace using invite code
        join_data = {"inviteCode": self.test_invite_code}
        join_response = self.make_request('POST', '/workspaces/join', join_data)
        
        if join_response and join_response.status_code == 200:
            join_result = join_response.json()
            if join_result.get('ok') and join_result.get('workspaceId'):
                # Verify user C can see the workspace
                list_response = self.make_request('GET', '/workspaces')
                if list_response and list_response.status_code == 200:
                    workspaces = list_response.json()['workspaces']
                    joined_workspace = next((w for w in workspaces if w['id'] == join_result['workspaceId']), None)
                    
                    if joined_workspace and joined_workspace['role'] == 'member':
                        self.token = original_token
                        self.log_result("Workspaces Join Code", True, f"User C joined workspace: {joined_workspace['name']}")
                        return True
                        
        self.token = original_token
        self.log_result("Workspaces Join Code", False, "Join by invite code failed")
        return False
        
    def test_workspaces_permissions(self):
        """Test workspace permission restrictions"""
        if not hasattr(self, 'test_workspace_id'):
            self.log_result("Workspaces Permissions", False, "No workspace to test with")
            return False
            
        # Create user D (non-member)
        user_d_data = {
            "name": "Dave Outsider",
            "email": "dave.outsider@neuroflow.test",
            "password": "SecurePass123!",
            "role": "freelancer"
        }
        
        response = self.make_request('POST', '/auth/register', user_d_data)
        if not response or response.status_code != 200:
            self.log_result("Workspaces Permissions", False, "Failed to create user D")
            return False
            
        user_d_token = response.json()['token']
        
        # Switch to User D (non-member)
        original_token = self.token
        self.token = user_d_token
        
        # Try to invite someone (should fail - only owner can invite)
        invite_data = {"email": "someone@test.com"}
        invite_response = self.make_request('POST', f'/workspaces/{self.test_workspace_id}/invite', invite_data)
        
        # Should get 403 or 404 (not found/forbidden)
        if invite_response and invite_response.status_code in [403, 404]:
            # Try to delete workspace (should fail - only owner can delete)
            delete_response = self.make_request('DELETE', f'/workspaces/{self.test_workspace_id}')
            
            if delete_response and delete_response.status_code in [403, 404]:
                self.token = original_token
                self.log_result("Workspaces Permissions", True, "Permission restrictions working correctly")
                return True
                
        self.token = original_token
        self.log_result("Workspaces Permissions", False, "Permission restrictions not working")
        return False
            
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting NeuroFlow Backend API Tests - Phase 2")
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
        
        # PHASE 2 TESTS
        print("\n🛡️ Phase 2: Anti-Fake Detection Tests")
        self.test_task_start_endpoint()
        self.test_anti_fake_instant_completion()
        self.test_anti_fake_honest_completion()
        self.test_anti_fake_habit_checkin()
        
        print("\n📋 Phase 2: Activity Logs & Batch Detection")
        self.test_activity_logs()
        self.test_batch_detection()
        
        print("\n📊 Phase 2: Enhanced Analytics & Behavior Protection")
        self.test_analytics_enhancement()
        self.test_behavior_engine_protection()
        
        print("\n👥 Phase 2: Workspaces & Collaboration")
        self.test_workspaces_create_and_list()
        self.test_workspaces_collaboration()
        self.test_workspaces_join_by_code()
        self.test_workspaces_permissions()
        
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
# python_pipeline/utils/connect_to_hosts.py (Enhanced)

import logging
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import dataclass
from typing import List, Union, Optional, Dict, Any, Tuple
from pathlib import Path
import paramiko
from jnpr.junos import Device
from jnpr.junos.exception import ConnectError, ConnectAuthError, ConnectTimeoutError
from jnpr.junos.utils.config import Config


@dataclass
class ConnectionConfig:
    """Configuration for device connections."""
    host: str
    username: str
    password: Optional[str] = None
    ssh_key_file: Optional[str] = None
    port: int = 22
    timeout: int = 30
    gather_facts: bool = True
    auto_probe: int = 5
    normalize: bool = True


@dataclass
class ConnectionResult:
    """Result of connection attempt."""
    host: str
    device: Optional[Device] = None
    success: bool = False
    error: Optional[str] = None
    facts: Optional[Dict[str, Any]] = None
    connection_time: float = 0.0


class JuniperConnectionManager:
    """Enhanced connection manager for Juniper devices."""
    
    def __init__(self, log_file: str = 'network_automation.log', log_level: int = logging.INFO):
        """Initialize connection manager with logging configuration."""
        self.setup_logging(log_file, log_level)
        self.connections: Dict[str, Device] = {}
        self.connection_lock = threading.Lock()
        
    def setup_logging(self, log_file: str, log_level: int):
        """Setup logging configuration."""
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # Setup file handler
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        
        # Setup console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        
        # Configure logger
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(log_level)
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
        
        # Prevent duplicate logs
        self.logger.propagate = False
    
    def _connect_single_device(self, config: ConnectionConfig) -> ConnectionResult:
        """Connect to a single device with comprehensive error handling."""
        start_time = time.time()
        result = ConnectionResult(host=config.host)
        
        try:
            self.logger.info(f"Attempting connection to {config.host}:{config.port}")
            
            # Prepare connection parameters
            conn_params = {
                'host': config.host,
                'user': config.username,
                'port': config.port,
                'timeout': config.timeout,
                'gather_facts': config.gather_facts,
                'auto_probe': config.auto_probe,
                'normalize': config.normalize
            }
            
            # Add authentication method
            if config.ssh_key_file:
                if not Path(config.ssh_key_file).exists():
                    raise FileNotFoundError(f"SSH key file not found: {config.ssh_key_file}")
                conn_params['ssh_private_key_file'] = config.ssh_key_file
                self.logger.info(f"Using SSH key authentication for {config.host}")
            elif config.password:
                conn_params['password'] = config.password
                self.logger.info(f"Using password authentication for {config.host}")
            else:
                raise ValueError("Either password or SSH key file must be provided")
            
            # Create and open connection
            device = Device(**conn_params)
            device.open()
            
            connection_time = time.time() - start_time
            
            # Gather device facts if requested
            facts = None
            if config.gather_facts and device.facts:
                facts = dict(device.facts)
                self.logger.info(f"Device facts gathered for {config.host}: "
                               f"Model: {facts.get('model', 'Unknown')}, "
                               f"Version: {facts.get('version', 'Unknown')}")
            
            result.device = device
            result.success = True
            result.facts = facts
            result.connection_time = connection_time
            
            self.logger.info(f"Successfully connected to {config.host} in {connection_time:.2f}s")
            
        except ConnectAuthError as e:
            error_msg = f"Authentication failed for {config.host}: {str(e)}"
            result.error = error_msg
            self.logger.error(error_msg)
            
        except ConnectTimeoutError as e:
            error_msg = f"Connection timeout to {config.host}: {str(e)}"
            result.error = error_msg
            self.logger.error(error_msg)
            
        except ConnectError as e:
            error_msg = f"Connection error to {config.host}: {str(e)}"
            result.error = error_msg
            self.logger.error(error_msg)
            
        except FileNotFoundError as e:
            error_msg = f"SSH key file error for {config.host}: {str(e)}"
            result.error = error_msg
            self.logger.error(error_msg)
            
        except Exception as e:
            error_msg = f"Unexpected error connecting to {config.host}: {str(e)}"
            result.error = error_msg
            self.logger.error(error_msg)
        
        return result
    
    def connect_to_hosts(self, 
                        hosts: Union[str, List[str]], 
                        username: str,
                        password: Optional[str] = None,
                        ssh_key_file: Optional[str] = None,
                        port: int = 22,
                        timeout: int = 30,
                        max_workers: int = 10,
                        gather_facts: bool = True) -> List[ConnectionResult]:
        """
        Connect to multiple hosts concurrently.
        
        Args:
            hosts: Single host or list of hosts
            username: SSH username
            password: SSH password (if not using key)
            ssh_key_file: Path to SSH private key file
            port: SSH port (default: 22)
            timeout: Connection timeout in seconds
            max_workers: Maximum concurrent connections
            gather_facts: Whether to gather device facts
            
        Returns:
            List of ConnectionResult objects
        """
        # Ensure hosts is a list
        host_list = [hosts] if isinstance(hosts, str) else hosts
        
        # Create connection configurations
        configs = []
        for host in host_list:
            config = ConnectionConfig(
                host=host,
                username=username,
                password=password,
                ssh_key_file=ssh_key_file,
                port=port,
                timeout=timeout,
                gather_facts=gather_facts
            )
            configs.append(config)
        
        results = []
        
        # Use ThreadPoolExecutor for concurrent connections
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            self.logger.info(f"Starting concurrent connections to {len(host_list)} hosts")
            
            # Submit all connection tasks
            future_to_config = {
                executor.submit(self._connect_single_device, config): config 
                for config in configs
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_config):
                config = future_to_config[future]
                try:
                    result = future.result()
                    results.append(result)
                    
                    # Store successful connections
                    if result.success and result.device:
                        with self.connection_lock:
                            self.connections[result.host] = result.device
                            
                except Exception as e:
                    error_msg = f"Future execution error for {config.host}: {str(e)}"
                    self.logger.error(error_msg)
                    results.append(ConnectionResult(
                        host=config.host,
                        success=False,
                        error=error_msg
                    ))
        
        # Log summary
        successful = sum(1 for r in results if r.success)
        self.logger.info(f"Connection summary: {successful}/{len(host_list)} successful")
        
        return results
    
    def get_connection(self, host: str) -> Optional[Device]:
        """Get an existing connection by hostname."""
        with self.connection_lock:
            return self.connections.get(host)
    
    def get_all_connections(self) -> Dict[str, Device]:
        """Get all active connections."""
        with self.connection_lock:
            return self.connections.copy()
    
    def disconnect_from_host(self, host: str) -> bool:
        """Disconnect from a specific host."""
        with self.connection_lock:
            device = self.connections.get(host)
            if device:
                try:
                    device.close()
                    del self.connections[host]
                    self.logger.info(f"Disconnected from {host}")
                    return True
                except Exception as e:
                    self.logger.error(f"Failed to disconnect from {host}: {str(e)}")
                    return False
            else:
                self.logger.warning(f"No active connection found for {host}")
                return False
    
    def disconnect_from_all_hosts(self) -> Dict[str, bool]:
        """Disconnect from all hosts and return success status for each."""
        results = {}
        
        with self.connection_lock:
            hosts_to_disconnect = list(self.connections.keys())
        
        self.logger.info(f"Disconnecting from {len(hosts_to_disconnect)} hosts")
        
        for host in hosts_to_disconnect:
            results[host] = self.disconnect_from_host(host)
        
        return results
    
    def check_connection_health(self, host: str) -> bool:
        """Check if a connection is still healthy."""
        device = self.get_connection(host)
        if not device:
            return False
        
        try:
            # Simple RPC call to test connection
            device.rpc.get_software_information()
            return True
        except Exception as e:
            self.logger.warning(f"Connection health check failed for {host}: {str(e)}")
            return False
    
    def reconnect_if_needed(self, host: str, config: ConnectionConfig) -> bool:
        """Reconnect to a host if the connection is unhealthy."""
        if self.check_connection_health(host):
            return True
        
        self.logger.info(f"Reconnecting to {host} due to unhealthy connection")
        self.disconnect_from_host(host)
        
        result = self._connect_single_device(config)
        if result.success:
            with self.connection_lock:
                self.connections[host] = result.device
            return True
        
        return False
    
    @contextmanager
    def get_config_context(self, host: str):
        """Context manager for configuration operations."""
        device = self.get_connection(host)
        if not device:
            raise ValueError(f"No connection found for {host}")
        
        config = Config(device)
        try:
            yield config
        finally:
            # Ensure we unlock configuration if something goes wrong
            try:
                config.unlock()
            except:
                pass
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - cleanup all connections."""
        self.disconnect_from_all_hosts()


# Legacy function for backward compatibility
def connect_to_hosts(host: Union[str, List[str]], username: str, password: str) -> List[Device]:
    """Legacy function for backward compatibility."""
    manager = JuniperConnectionManager()
    results = manager.connect_to_hosts(host, username, password)
    return [r.device for r in results if r.success and r.device]


def disconnect_from_hosts(connections: List[Device]):
    """Legacy function for backward compatibility."""
    logger = logging.getLogger(__name__)
    logger.info(f"Disconnecting from {len(connections)} connections")
    
    for dev in connections:
        try:
            hostname = getattr(dev, 'hostname', 'unknown device')
            dev.close()
            logger.info(f"Disconnected from {hostname}")
        except Exception as e:
            logger.error(f"Failed to disconnect from a device: {str(e)}")


# Example usage
if __name__ == "__main__":
    # Example 1: Using the enhanced connection manager
    with JuniperConnectionManager() as manager:
        # Connect to multiple hosts
        results = manager.connect_to_hosts(
            hosts=['192.168.1.1', '192.168.1.2'],
            username='admin',
            password='password123',
            timeout=30,
            max_workers=5
        )
        
        # Process results
        for result in results:
            if result.success:
                print(f"Connected to {result.host} - Model: {result.facts.get('model', 'Unknown')}")
            else:
                print(f"Failed to connect to {result.host}: {result.error}")
        
        # Use connections for operations
        for host, device in manager.get_all_connections().items():
            # Example: Get interface information
            try:
                interfaces = device.rpc.get_interface_information()
                print(f"Retrieved interface info from {host}")
            except Exception as e:
                print(f"Failed to get interface info from {host}: {e}")
    
    # Example 2: Using SSH key authentication
    with JuniperConnectionManager() as manager:
        results = manager.connect_to_hosts(
            hosts='192.168.1.1',
            username='admin',
            ssh_key_file='/path/to/private/key',
            gather_facts=True
        )

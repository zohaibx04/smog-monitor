package pk.edu.nust.aeris;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
class LocationDiscoveryServiceTest {
    @Test void searchesOnlyConfiguredPakistanCitiesWithoutNetwork() {
        var areas=mock(AreaRepository.class);var monitoring=mock(MonitoringService.class);
        var city=new MonitoredArea("Lahore, Pakistan",31.5204,74.3587);city.id=2L;
        when(areas.findByArchivedFalseOrderByIdAsc()).thenReturn(List.of(city));
        var service=new LocationDiscoveryService(areas,monitoring);
        assertEquals("Punjab",service.search("lah","PK").get(0).region());
        assertTrue(service.search("Tokyo","").isEmpty());
        assertTrue(service.search("Lahore","GB").isEmpty());
        verifyNoInteractions(monitoring);
    }
    @Test void previewDoesNotInventMissingConcentrations() {
        var areas=mock(AreaRepository.class);var monitoring=mock(MonitoringService.class);
        when(areas.findByArchivedFalseOrderByIdAsc()).thenReturn(List.of());
        var result=new LocationDiscoveryService(areas,monitoring).preview(31.5,74.3);
        assertNull(result.aqi());assertNull(result.pm25());assertTrue(result.stale());
    }
}

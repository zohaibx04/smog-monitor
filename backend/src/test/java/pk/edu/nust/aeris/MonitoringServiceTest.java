package pk.edu.nust.aeris;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MonitoringServiceTest {
    final AreaRepository areas=mock(AreaRepository.class);
    final ReadingRepository readings=mock(ReadingRepository.class);
    final PreferenceRepository preferences=mock(PreferenceRepository.class);
    final AlertRepository alerts=mock(AlertRepository.class);
    final MonitoringService service=new MonitoringService(areas,readings,preferences,alerts,false,
        mock(OpenMeteoService.class),org.springframework.transaction.support.TransactionOperations.withoutTransaction());
    AlertPreference preference;
    @BeforeEach void setup() {
        preference=new AlertPreference();preference.id=1L;preference.areaId=1L;preference.aqiThreshold=100;
        when(preferences.findByAreaIdAndEnabledTrue(1L)).thenReturn(List.of(preference));
    }
    SmogReading reading(long id,double aqi,int secondsAgo) {
        var r=new SmogReading();r.id=id;r.areaId=1L;r.aqi=aqi;r.timestamp=Instant.now().minusSeconds(secondsAgo);r.source=OpenMeteoService.SOURCE;return r;
    }
    @Test void thresholdCrossingCreatesOneAlertUntilRecovery() {
        service.evaluate(reading(1,101,100));service.evaluate(reading(2,120,90));
        verify(alerts,times(1)).save(any());
        service.evaluate(reading(3,100,80));service.evaluate(reading(4,101,70));
        verify(alerts,times(2)).save(any());
    }
    @Test void staleAndFutureReadingsCannotTriggerAlerts() {
        service.evaluate(reading(1,200,10801));service.evaluate(reading(2,200,-3600));
        verifyNoInteractions(preferences,alerts);
    }
    @Test void repeatedReadingDoesNotDuplicateAnAlert() {
        var r=reading(1,120,20);service.evaluate(r);service.evaluate(r);verify(alerts,times(1)).save(any());
    }
    @Test void recoveryResolvesActiveAlert() {
        var a=new SmogAlert();a.status="Active";
        when(alerts.findByPreferenceIdAndStatusIn(1L, List.of("Active", "Acknowledged"))).thenReturn(List.of(a));
        preference.aboveThreshold=true;service.evaluate(reading(2,100,10));
        assertEquals("Resolved",a.status);verify(alerts).save(a);
    }
    @Test void otherProviderCannotTriggerAlert() {
        var r=reading(10,200,10);r.source="Archived provider";service.evaluate(r);verifyNoInteractions(preferences,alerts);
    }
    @Test void nullableAqiDoesNotTrigger() {
        var r=reading(1,100,5);r.aqi=null;service.evaluate(r);verifyNoInteractions(preferences,alerts);
    }
    @Test void recoveryResolvesAcknowledgedEpisode() {
        var a=new SmogAlert();a.status="Acknowledged";
        when(alerts.findByPreferenceIdAndStatusIn(1L, List.of("Active", "Acknowledged"))).thenReturn(List.of(a));
        preference.aboveThreshold=true;service.evaluate(reading(2,90,10));
        assertEquals("Resolved",a.status);verify(alerts).save(a);
    }
    @Test void delayedRefreshProcessesRecoveryBeforeNextCrossing() {
        preference.aboveThreshold=true;
        var previous=new SmogAlert();previous.status="Active";
        when(alerts.findByPreferenceIdAndStatusIn(1L, List.of("Active", "Acknowledged"))).thenReturn(List.of(previous));
        var recovery=reading(2,80,7200);var crossing=reading(3,130,3600);
        when(readings.findByAreaIdAndSourceAndTimestampBetweenOrderByTimestampAsc(eq(1L),eq(service.source()),any(),any()))
            .thenReturn(List.of(recovery,crossing));
        service.evaluateRecentReadings(1L);
        assertEquals("Resolved",previous.status);
        verify(alerts).save(argThat(a -> a.readingId!=null && a.readingId.equals(3L) && a.status.equals("Active")));
        assertTrue(preference.aboveThreshold);assertEquals(crossing.timestamp,preference.lastEvaluatedAt);
    }
    @Test void providerMissingAndNegativeValuesAreNotConvertedToZero() throws Exception {
        var json=new com.fasterxml.jackson.databind.ObjectMapper().readTree("{\"us_aqi\":[null,-1,0,75]}");
        assertNull(MonitoringService.value(json,"us_aqi",0));
        assertNull(MonitoringService.value(json,"us_aqi",1));
        assertEquals(0.0,MonitoringService.value(json,"us_aqi",2));
        assertEquals(75.0,MonitoringService.value(json,"us_aqi",3));
        assertNull(MonitoringService.value(json,"pm10",0));
    }
}

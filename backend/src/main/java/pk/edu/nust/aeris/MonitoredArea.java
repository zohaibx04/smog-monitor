package pk.edu.nust.aeris;
import jakarta.persistence.*;
@Entity
public class MonitoredArea {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    public String name;
    public double latitude;
    public double longitude;
    public boolean active = true;
    @Column(nullable=false, columnDefinition="boolean default false")
    public boolean archived = false;
    @Column(nullable=false, columnDefinition="boolean default false")
    public boolean customLocation = false;
    public String lastError;
    public MonitoredArea() {}
    public MonitoredArea(String name, double latitude, double longitude) {
        this.name=name; this.latitude=latitude; this.longitude=longitude;
    }
}
